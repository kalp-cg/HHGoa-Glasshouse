import { describe, expect, it, vi } from "vitest";
import type { Address } from "@glasshouse/engine";
import { fetchAlchemyLedger, setRetrySleep } from "../src/ingestAlchemy";
import { BASE_USDC } from "../src/constants";

const me = "0x1111111111111111111111111111111111111111" as Address;
const seller = "0x2222222222222222222222222222222222222222";
const funder = "0x3333333333333333333333333333333333333333";
const facilitator = "0x4444444444444444444444444444444444444444";
const h = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const t = (hash: string, from: string, to: string, value: number, iso: string) =>
  ({ hash, from, to, value, metadata: { blockTimestamp: iso } });

// a fake Alchemy: x402 payment (facilitator submits), own gas-paid transfer, an inbound top-up, two pages
function fakeAlchemy() {
  const calls: { method: string; params: unknown[] }[] = [];
  const post = vi.fn(async (body: unknown) => {
    if (Array.isArray(body)) {
      return body.map((c: { id: number; method: string; params: unknown[] }) => {
        calls.push(c);
        if (c.method === "eth_getTransactionByHash") return { id: c.id, result: { from: c.params[0] === h(1) ? facilitator : me } };
        return { id: c.id, result: { timestamp: c.params[0] === "0x64" ? "0x6700e000" : "0x6702e980" } };
      });
    }
    const { method, params } = body as { method: string; params: Record<string, unknown>[] };
    calls.push({ method, params });
    const p = params[0]!;
    if (p.fromAddress) {
      return p.pageKey
        ? { result: { transfers: [t(h(2), me, seller, 0.02, "2026-10-29T01:00:00.000Z")] } }
        : { result: { transfers: [t(h(1), me, seller, 0.01, "2026-10-29T00:00:00.000Z")], pageKey: "next" } };
    }
    return { result: { transfers: [t(h(3), funder, me, 5, "2026-10-28T23:00:00.000Z")] } };
  });
  return { post, calls };
}

describe("fetchAlchemyLedger", () => {
  it("keeps x402-style payments (someone else submitted) and inbound funding; drops self-submitted transfers", async () => {
    const { post, calls } = fakeAlchemy();
    const ledger = await fetchAlchemyLedger(me, { fromBlock: 100n, toBlock: 200n }, post);

    expect(ledger.transfers.map((x) => [x.tx, x.from, x.to, x.amount])).toEqual([
      [h(3), funder, me, 5],
      [h(1), me, seller, 0.01],
    ]);
    expect(ledger.transfers[0]!.ts).toBe(Date.parse("2026-10-28T23:00:00Z") / 1000);
    expect(ledger.wallets.map((w) => w.addr)).toEqual([me, seller, funder].sort());
    expect(ledger.wallets.every((w) => w.kind === "" && w.category === null)).toBe(true);
    expect(ledger.days).toBeCloseTo((0x6702e980 - 0x6700e000) / 86_400);

    const first = calls.find((c) => c.method === "alchemy_getAssetTransfers")!.params[0] as Record<string, unknown>;
    expect(first).toMatchObject({ fromBlock: "0x64", toBlock: "0xc8", category: ["erc20"], contractAddresses: [BASE_USDC], withMetadata: true });
    expect(calls.filter((c) => c.method === "alchemy_getAssetTransfers")).toHaveLength(3); // out page 1, out page 2, in
  });

  it("busy wallets: checks a sample of transactions, and treats the rest as x402-style when the sample says agent wallet", async () => {
    const many = Array.from({ length: 40 }, (_, i) => t(h(100 + i), me, seller, 0.01, "2026-10-29T00:00:00.000Z"));
    const lookups: string[] = [];
    const post = vi.fn(async (body: unknown) => {
      if (Array.isArray(body)) {
        return body.map((c: { id: number; method: string; params: unknown[] }) => {
          if (c.method === "eth_getTransactionByHash") { lookups.push(String(c.params[0])); return { id: c.id, result: { from: facilitator } }; }
          return { id: c.id, result: { timestamp: "0x6700e000" } };
        });
      }
      const p = (body as { params: Record<string, unknown>[] }).params[0]!;
      return { result: { transfers: p.fromAddress ? many : [] } };
    });
    const ledger = await fetchAlchemyLedger(me, { fromBlock: 1n, toBlock: 2n }, post, { maxLookups: 10 });
    expect(lookups).toHaveLength(10);                 // 40 transactions, every 4th checked
    expect(ledger.transfers).toHaveLength(40);        // all kept: the sample was all facilitated

    const selfPaid = vi.fn(async (body: unknown) => {
      if (Array.isArray(body)) return body.map((c: { id: number; method: string }) => ({ id: c.id, result: c.method === "eth_getTransactionByHash" ? { from: me } : { timestamp: "0x6700e000" } }));
      const p = (body as { params: Record<string, unknown>[] }).params[0]!;
      return { result: { transfers: p.fromAddress ? many : [] } };
    });
    expect((await fetchAlchemyLedger(me, { fromBlock: 1n, toBlock: 2n }, selfPaid, { maxLookups: 10 })).transfers).toHaveLength(0);
  });

  it("retries 429 (compute units per second) for single calls and batches, then succeeds", async () => {
    setRetrySleep(1);
    const inner = fakeAlchemy();
    let limited = 0;
    const post = vi.fn(async (body: unknown) => {
      if (limited++ < 3) return Array.isArray(body) ? body.map((c: { id: number }) => ({ id: c.id, error: { code: 429, message: "exceeded its compute units per second capacity" } })) : { error: { code: 429, message: "compute units" } };
      return inner.post(body);
    });
    const ledger = await fetchAlchemyLedger(me, { fromBlock: 100n, toBlock: 200n }, post);
    expect(ledger.transfers).toHaveLength(2);
    expect(limited).toBeGreaterThan(3);
  });

  it("gives up with the Alchemy message after the retries", async () => {
    setRetrySleep(1);
    const post = vi.fn(async () => ({ error: { code: 429, message: "compute units per second" } }));
    await expect(fetchAlchemyLedger(me, { fromBlock: 1n, toBlock: 2n }, post)).rejects.toThrow("compute units");
  });

  it("surfaces Alchemy errors", async () => {
    const post = vi.fn(async () => ({ error: { message: "rate limited" } }));
    await expect(fetchAlchemyLedger(me, { fromBlock: 1n, toBlock: 2n }, post)).rejects.toThrow("rate limited");
  });
});
