// Live real-chain data, totals only (AGENTS.md: real-chain data outside a signed audit is totals only).
// - pulse(): x402-style payments in the latest 10 Base blocks (~20 s), cached 20 s so any number of viewers cost one call.
// - sampleLive(): at most once every 2 minutes (a store lock shared by all viewers), analyse one more real payer's day
//   in memory and fold it into running totals. No address is kept: only a hash, so a wallet is never counted twice.
import { createHash } from "node:crypto";
import { fetchAgentTransfers } from "@glasshouse/chain";
import type { Address } from "@glasshouse/engine";
import { auditProfile } from "./audit";
import { store } from "./store";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const AUTHORIZATION_USED = "0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5";
const DAY_BLOCKS = 43_200n;
const PULSE_TTL_MS = 20_000;
const SAMPLE_EVERY_SEC = 120;

async function call<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(process.env.BASE_RPC_URL || "https://mainnet.base.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.result === undefined) throw new Error(`Base RPC ${method}: ${body.error?.message ?? res.status}`);
  return body.result;
}

async function latestPayments(): Promise<{ block: number; payers: string[]; payments: number }> {
  const latest = BigInt(await call<string>("eth_blockNumber", []));
  const logs = await call<{ topics: string[] }[]>("eth_getLogs", [{
    address: USDC, topics: [AUTHORIZATION_USED], fromBlock: `0x${(latest - 9n).toString(16)}`, toBlock: `0x${latest.toString(16)}`,
  }]);
  return { block: Number(latest), payers: [...new Set(logs.map((l) => `0x${l.topics[1]!.slice(-40)}`))], payments: logs.length };
}

export interface Pulse { block: number; seconds: number; payments: number; payers: number; per_minute: number; at: string }
let pulseCache: { at: number; value: Pulse } | undefined;

export async function pulse(): Promise<Pulse> {
  if (pulseCache && Date.now() - pulseCache.at < PULSE_TTL_MS) return pulseCache.value;
  const { block, payers, payments } = await latestPayments();
  const value = { block, seconds: 20, payments, payers: payers.length, per_minute: payments * 3, at: new Date().toISOString() };
  pulseCache = { at: Date.now(), value };
  return value;
}

export interface LiveTotals {
  wallets: number;
  time_zone: number;
  exchange: number;
  linked: number;
  signal: number;
  around_the_clock: number;
  payments: number[];                      // per-wallet daily payment counts, for the median (no identity)
  by_time_zone: Record<string, number>;
  by_signal: Record<string, number>;
  updated_at: string | null;
}
const EMPTY: LiveTotals = { wallets: 0, time_zone: 0, exchange: 0, linked: 0, signal: 0, around_the_clock: 0, payments: [], by_time_zone: {}, by_signal: {}, updated_at: null };
const KEY = "live:totals";

export async function liveTotals(): Promise<LiveTotals> {
  const raw = await store().get(KEY);
  return raw ? (JSON.parse(raw) as LiveTotals) : EMPTY;
}

// Returns true if a new wallet was added. Only one sample runs per 2 minutes, across all viewers and servers.
export async function sampleLive(): Promise<boolean> {
  const s = store();
  if (!(await s.setNx("live:lock", "1", SAMPLE_EVERY_SEC))) return false;
  const { block, payers } = await latestPayments();
  // claim exactly one wallet not counted before, in random order (claiming marks it as seen)
  let payer: string | undefined;
  for (const p of [...payers].sort(() => Math.random() - 0.5)) {
    if (await s.sadd("live:seen", createHash("sha256").update(`glasshouse-live:${p}`).digest("hex"))) {
      payer = p;
      break;
    }
  }
  if (!payer) return false;
  const latest = BigInt(block);
  const facts = await auditProfile(await fetchAgentTransfers(payer as Address, { fromBlock: latest - DAY_BLOCKS, toBlock: latest }), payer as Address);
  if (facts.spend.payments === 0) return false;

  const t = await liveTotals();
  const add = (o: Record<string, number>, k: string) => ({ ...o, [k]: (o[k] ?? 0) + 1 });
  const next: LiveTotals = {
    wallets: t.wallets + 1,
    time_zone: t.time_zone + (facts.timezone ? 1 : 0),
    exchange: t.exchange + (facts.identity_anchor ? 1 : 0),
    linked: t.linked + (facts.wallets.length > 1 ? 1 : 0),
    signal: t.signal + (facts.signals.length > 0 ? 1 : 0),
    around_the_clock: t.around_the_clock + (facts.hourly.filter((h) => h > 0).length >= 40 ? 1 : 0),
    payments: [...t.payments, facts.spend.payments].slice(-500),
    by_time_zone: facts.timezone ? add(t.by_time_zone, facts.timezone.label) : t.by_time_zone,
    by_signal: facts.signals.reduce((o, sig) => add(o, sig.category), t.by_signal),
    updated_at: new Date().toISOString(),
  };
  await s.set(KEY, JSON.stringify(next));
  return true;
}
