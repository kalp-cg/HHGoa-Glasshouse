// `pnpm real:totals`: what real agent payments on Base give away, as totals only.
// Samples x402-style payers (EIP-3009 AuthorizationUsed on Base USDC) from windows spread over the last 24 h, runs the
// same analysis as the demo on each payer's day of history *in memory*, and writes only aggregate numbers to
// fixtures/real-base-totals.json. No address, transaction or per-wallet record is written anywhere (AGENTS.md:
// real-chain data elsewhere is totals only).
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyze, labelRealChain, profile, type Address, type Category, type ProfileFacts } from "../packages/engine/src/index";
import { fetchAgentTransfers } from "../packages/chain/src/ingestBase";
import serviceList from "../fixtures/x402-services.base.json";

const RPC = process.env.BASE_RPC_URL;
if (!RPC?.includes("alchemy.com")) {
  console.error("needs BASE_RPC_URL pointing to an Alchemy Base mainnet endpoint in .env");
  process.exit(1);
}
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const AUTHORIZATION_USED = "0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5";
const DAY_BLOCKS = 43_200n;              // Base: 2 s blocks
const WINDOWS = Number(process.env.REAL_WINDOWS ?? 30);
const SAMPLE = Number(process.env.REAL_SAMPLE ?? 30);
const MIN_BUCKET = 3;                    // time-zone groups smaller than this are merged into "other"
const SERVICES: Record<string, string> = serviceList.services;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(RPC!, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    if (res.status === 429 && attempt < 8) { await new Promise((r) => setTimeout(r, 500 * attempt)); continue; }
    const body = (await res.json()) as { result?: T; error?: { message: string } };
    if (body.result === undefined) throw new Error(`${method}: ${body.error?.message ?? res.status}`);
    return body.result;
  }
}

// 1. Who paid recently? Payers from 10-block windows spread over the day (Alchemy's free plan allows 10 blocks).
const latest = BigInt(await rpc<string>("eth_blockNumber", []));
const payers = new Set<string>();
for (let i = 0; i < WINDOWS; i++) {
  const from = latest - DAY_BLOCKS + (DAY_BLOCKS * BigInt(i)) / BigInt(WINDOWS);
  const logs = await rpc<{ topics: string[] }[]>("eth_getLogs", [{ address: USDC, topics: [AUTHORIZATION_USED], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${(from + 9n).toString(16)}` }]);
  for (const l of logs) payers.add(`0x${l.topics[1]!.slice(-40)}`);
}
// an even, reproducible sample: order by hash, take the first SAMPLE
const sample = [...payers].sort((x, y) => createHash("sha256").update(x).digest("hex").localeCompare(createHash("sha256").update(y).digest("hex"))).slice(0, SAMPLE);
console.log(`${payers.size} distinct x402-style payers in ${WINDOWS} windows; analysing ${sample.length}`);

// 2. The same analysis as the demo, one wallet at a time, kept only as numbers.
const results: ProfileFacts[] = [];
for (const [i, payer] of sample.entries()) {
  try {
    const ledger = await fetchAgentTransfers(payer as Address, { fromBlock: latest - DAY_BLOCKS, toBlock: latest });
    const labelled = await labelRealChain(ledger, payer as Address, {
      serviceCategory: (a) => (SERVICES[a] as Category | undefined) ?? null,
      sendCount: async (a) => Number(BigInt(await rpc<string>("eth_getTransactionCount", [a, "latest"]))),
    });
    const facts = profile(labelled, analyze(labelled), payer as Address, { mode: "open", source: "base-mainnet" });
    if (facts.spend.payments > 0) results.push(facts);
    process.stdout.write(`\r  analysed ${i + 1}/${sample.length}`);
  } catch (err) {
    process.stdout.write(`\r  wallet ${i + 1} skipped (${err instanceof Error ? err.message.slice(0, 60) : "error"})\n`);
  }
}
console.log();

// 3. Totals only.
const n = results.length;
const pct = (k: number) => (n ? Math.round((k / n) * 100) : 0);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : 0; };
const busySlots = (f: ProfileFacts) => f.hourly.filter((h) => h > 0).length;
const tz: Record<string, number> = {};
for (const f of results) if (f.timezone) tz[f.timezone.label] = (tz[f.timezone.label] ?? 0) + 1;
const timezones: Record<string, number> = {};
for (const [label, k] of Object.entries(tz)) timezones[k >= MIN_BUCKET ? label : "other"] = (timezones[k >= MIN_BUCKET ? label : "other"] ?? 0) + k;
const categoryPayments: Record<string, number> = {};
for (const f of results) for (const s of f.signals) categoryPayments[s.category] = (categoryPayments[s.category] ?? 0) + 1;

const totals = {
  generated_at: new Date().toISOString(),
  window: "last 24 hours of Base mainnet",
  method: `x402-style payers (USDC EIP-3009 authorizations) sampled from ${WINDOWS} ten-block windows across the day; each wallet's day of history analysed in memory with the same rules as the demo; only these totals are kept`,
  payers_seen: payers.size,
  wallets_analysed: n,
  median_payments_per_day: median(results.map((f) => f.spend.payments)),
  give_away_time_zone_pct: pct(results.filter((f) => f.timezone).length),
  run_around_the_clock_pct: pct(results.filter((f) => busySlots(f) >= 40).length),
  funded_from_exchange_like_wallet_pct: pct(results.filter((f) => f.identity_anchor).length),
  linked_to_another_wallet_pct: pct(results.filter((f) => f.wallets.length > 1).length),
  show_a_life_signal_pct: pct(results.filter((f) => f.signals.length > 0).length),
  wallets_by_signal: categoryPayments,
  wallets_by_time_zone: timezones,
};
writeFileSync(join(import.meta.dirname, "../fixtures/real-base-totals.json"), JSON.stringify(totals, null, 2) + "\n");
console.log(JSON.stringify(totals, null, 2));
