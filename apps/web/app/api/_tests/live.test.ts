// Live real-chain totals, against a fake Base RPC and a temporary store: counts, caching, one sampler at a time,
// no double counting, and no address ever written to the store.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simulate, type Address, type Ledger } from "@glasshouse/engine";
import { beforeAll, describe, expect, it, vi } from "vitest";

const sim = simulate(42, "open");
const payerA = sim.you.agents[2]!;   // the travel agent: a busy, real-looking payer
const payerB = sim.you.agents[0]!;

const ledgerFor = (p: Address): Ledger => {
  const transfers = sim.ledger.transfers.filter((t) => t.from === p || t.to === p);
  const addrs = [...new Set(transfers.flatMap((t) => [t.from, t.to]))].sort();
  return { seed: 0, start_ts: sim.ledger.start_ts, days: 10, wallets: addrs.map((addr) => ({ addr, kind: "", label: "", category: null })), transfers };
};
vi.mock("@glasshouse/chain", async (orig) => ({
  ...(await orig<typeof import("@glasshouse/chain")>()),
  fetchAgentTransfers: vi.fn(async (p: Address) => ledgerFor(p)),
}));

const topic = (a: string) => `0x${a.slice(2).padStart(64, "0")}`;
let rpcCalls = 0;
const rpc = vi.fn(async (_url: unknown, init?: RequestInit) => {
  rpcCalls++;
  const { method } = JSON.parse(String(init?.body)) as { method: string };
  if (method === "eth_blockNumber") return Response.json({ result: "0x1000000" });
  if (method === "eth_getLogs") return Response.json({ result: [payerA, payerA, payerB].map((p) => ({ topics: ["0xauth", topic(p)] })) });
  if (method === "eth_getTransactionCount") return Response.json({ result: "0x2" });
  return Response.json({ error: { message: `unexpected ${method}` } });
});

let storeFile = "";
let live: typeof import("../_lib/live");
beforeAll(async () => {
  storeFile = join(mkdtempSync(join(tmpdir(), "gh-live-")), "store.json");
  process.env.GLASSHOUSE_STORE_FILE = storeFile;
  for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) process.env[k] = "";
  vi.stubGlobal("fetch", rpc);
  live = await import("../_lib/live");
});

describe("live pulse", () => {
  it("counts payments and distinct payers in the latest blocks, and caches for 20 s", async () => {
    const p = await live.pulse();
    expect(p).toMatchObject({ payments: 3, payers: 2, per_minute: 9, seconds: 20 });
    const before = rpcCalls;
    await live.pulse();
    expect(rpcCalls).toBe(before); // served from the cache
  });
});

describe("live real-wallet sample", () => {
  it("adds one wallet per window, never the same wallet twice, and stores no address", async () => {
    expect(await live.sampleLive()).toBe(true);
    expect(await live.sampleLive()).toBe(false); // the 2-minute lock is held
    const t = await live.liveTotals();
    expect(t.wallets).toBe(1);
    expect(t.payments).toHaveLength(1);
    const stored = readFileSync(storeFile, "utf8");
    expect(stored).not.toMatch(/0x[0-9a-f]{40}/i);
  });

  it("after the lock expires, a second sample takes a wallet not seen before", async () => {
    const raw = JSON.parse(readFileSync(storeFile, "utf8")) as Record<string, { v: unknown; exp?: number }>;
    raw["live:lock"]!.exp = Date.now() - 1; // the 2 minutes pass
    const { writeFileSync } = await import("node:fs");
    writeFileSync(storeFile, JSON.stringify(raw));
    expect(await live.sampleLive()).toBe(true);
    expect((await live.liveTotals()).wallets).toBe(2);
    raw["live:lock"]!.exp = Date.now() - 1;
    writeFileSync(storeFile, JSON.stringify({ ...JSON.parse(readFileSync(storeFile, "utf8")), "live:lock": raw["live:lock"] }));
    expect(await live.sampleLive()).toBe(false); // both payers already counted
    expect((await live.liveTotals()).wallets).toBe(2);
  });
});
