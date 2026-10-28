import { describe, expect, it } from "vitest";
import { agentPayments, analyze, linkCoactivity, linkFunding } from "../src/analyze";
import { simulate } from "../src/simulate";
import type { Address, Ledger, WalletInfo } from "../src/types";

const a = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
const wallet = (addr: Address, kind: WalletInfo["kind"] = ""): WalletInfo =>
  ({ addr, kind, label: kind ? "L" : "", category: kind === "service" ? "Health" : null });

function ledger(wallets: WalletInfo[], transfers: [Address, Address, number, number][], days = 10): Ledger {
  return { seed: 0, start_ts: 0, days, wallets, transfers: transfers.map(([from, to, amount, ts], i) => ({ tx: `0x${i}`, from, to, amount, ts })) };
}

describe("linkFunding (Rule 1)", () => {
  it("links unlabelled → unlabelled, aggregating repeat top-ups", () => {
    const l = ledger([wallet(a(1)), wallet(a(2)), wallet(a(3))], [[a(1), a(2), 25, 0], [a(1), a(3), 5, 1], [a(1), a(3), 5, 2]]);
    expect(linkFunding(l)).toEqual([
      { a: a(1), b: a(2), rule: "funding", detail: "topped up 25 USDC" },
      { a: a(1), b: a(3), rule: "funding", detail: "topped up 2 times, 10 USDC" },
    ]);
  });

  it("never links through labelled wallets", () => {
    const l = ledger([wallet(a(1)), wallet(a(2)), wallet(a(9), "exchange"), wallet(a(8), "pool")],
      [[a(9), a(1), 10, 0], [a(9), a(2), 10, 0], [a(1), a(8), 10, 1], [a(8), a(2), 1, 2]]);
    expect(linkFunding(l)).toEqual([]);
  });
});

describe("linkCoactivity (Rule 2)", () => {
  const svc = a(100);
  const ws = [wallet(a(1)), wallet(a(2)), wallet(svc, "service")];
  const day = 86_400;
  const together = (days: number, sessionsPerDay: number) =>
    Array.from({ length: days * sessionsPerDay }, (_, i) => {
      const t = Math.floor(i / sessionsPerDay) * day + (i % sessionsPerDay) * 3600;
      return [[a(1), svc, 0.01, t], [a(2), svc, 0.01, t + 30]] as [Address, Address, number, number][];
    }).flat();

  it("links wallets that pay together in >= 4 sessions over >= 3 days", () => {
    const links = linkCoactivity(ledger(ws, together(3, 2)));
    expect(links).toEqual([{ a: a(1), b: a(2), rule: "co-activity", detail: "same 2 minutes on 3 days" }]);
  });

  it("needs 3 distinct days", () => {
    expect(linkCoactivity(ledger(ws, together(2, 3)))).toEqual([]);
  });

  it("needs 4 distinct sessions", () => {
    expect(linkCoactivity(ledger(ws, together(3, 1)))).toEqual([]);
  });

  it("needs >= 20x chance: very busy wallets that overlap a few times don't link", () => {
    // 6 real overlaps, but each wallet also pays every 10 minutes for 10 days → expected ≈ 540
    const busy: [Address, Address, number, number][] = [];
    for (let t = 0; t < 10 * day; t += 600) busy.push([a(1), svc, 0.01, t], [a(2), svc, 0.01, t + 300]);
    expect(linkCoactivity(ledger(ws, [...together(3, 2), ...busy]))).toEqual([]);
  });

  it("ignores payments outside 90 s", () => {
    const l = ledger(ws, together(3, 2).map(([f, t, amt, ts]) => [f, t, amt, f === a(2) ? ts + 61 : ts]));
    expect(linkCoactivity(l)).toEqual([]);
  });
});

describe("analyze on the simulated world", () => {
  it("agentPayments are unlabelled → service only", () => {
    const { ledger: l } = simulate(42);
    const kind = new Map(l.wallets.map((w) => [w.addr, w.kind]));
    expect(agentPayments(l).every((t) => kind.get(t.from) === "" && kind.get(t.to) === "service")).toBe(true);
  });

  it("links all of 'you' in open mode: 2 funding links + 1 co-activity link", () => {
    const { ledger: l, you } = simulate(42);
    const mine = new Set([you.personal, ...you.agents]);
    const links = analyze(l).filter((k) => mine.has(k.a) || mine.has(k.b));
    expect(links.map((k) => k.rule).sort()).toEqual(["co-activity", "funding", "funding"]);
  });

  // Gate 1: zero false links, checked against ground truth
  it.each([1, 2, 3, 4, 42])("seed %i: zero false links in both modes", (seed) => {
    for (const mode of ["open", "shield"] as const) {
      const { ledger: l, truth } = simulate(seed, mode);
      const owner = new Map(Object.entries(truth.owners).flatMap(([id, as]) => as.map((x) => [x, id])));
      const links = analyze(l);
      expect(links.length).toBeGreaterThan(0);
      expect(links.filter((k) => owner.get(k.a) !== owner.get(k.b))).toEqual([]);
    }
  });
});
