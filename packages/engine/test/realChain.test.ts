import { describe, expect, it } from "vitest";
import { analyze } from "../src/analyze";
import { profile } from "../src/profile";
import { labelRealChain } from "../src/realChain";
import type { Address, Ledger } from "../src/types";

const a = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
const me = a(1), exchange = a(2), friend = a(3), healthApi = a(10), unknownApi = a(11);

// one wallet's real history, everything unlabelled, as the chain ingest returns it
const transfers: Ledger["transfers"] = [
  { tx: "0x1", from: exchange, to: me, amount: 50, ts: 1_000 },
  { tx: "0x2", from: friend, to: me, amount: 5, ts: 1_100 },
  ...Array.from({ length: 4 }, (_, i) => ({ tx: `0xa${i}`, from: me, to: healthApi, amount: 0.02, ts: 2_000 + i * 60 })),
  { tx: "0xb", from: me, to: unknownApi, amount: 0.01, ts: 3_000 },
];
const ledger: Ledger = { seed: 0, start_ts: 0, days: 1, transfers,
  wallets: [me, exchange, friend, healthApi, unknownApi].map((addr) => ({ addr, kind: "", label: "", category: null })) };

const lookups = {
  serviceCategory: (x: Address) => (x === healthApi ? ("Health" as const) : null),
  sendCount: async (x: Address) => (x === exchange ? 2_000_000 : 3),
};

describe("labelRealChain", () => {
  it("labels paid wallets as services (category from the public list) and a busy funder as the likely exchange", async () => {
    const out = await labelRealChain(ledger, me, lookups);
    const w = new Map(out.wallets.map((x) => [x.addr, x]));
    expect(w.get(healthApi)).toMatchObject({ kind: "service", category: "Health" });
    expect(w.get(unknownApi)).toMatchObject({ kind: "service", category: null });
    expect(w.get(exchange)).toMatchObject({ kind: "exchange", label: "a high-volume wallet (probably an exchange)" });
    expect(w.get(friend)!.kind).toBe("");
  });

  it("the profile then names the exchange, links only the small funder, and finds the health signal", async () => {
    const out = await labelRealChain(ledger, me, lookups);
    const p = profile(out, analyze(out), me, { mode: "open", source: "base-mainnet" });
    expect(p.identity_anchor).toEqual({ exchange_label: "a high-volume wallet (probably an exchange)" });
    expect(p.wallets.map((x) => x.addr).sort()).toEqual([me, friend].sort());
    expect(p.signals.map((s) => s.category)).toEqual(["Health"]);
    expect(p.linkability).toEqual({ traced: 5, total: 5 });
  });

  it("a failing lookup never marks anyone as an exchange", async () => {
    const out = await labelRealChain(ledger, me, { ...lookups, sendCount: async () => { throw new Error("rpc down"); } });
    expect(out.wallets.some((x) => x.kind === "exchange")).toBe(false);
  });
});
