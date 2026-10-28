import { describe, expect, it } from "vitest";
import { simulate, START_TS } from "../src/simulate";
import { validateGroundTruth, validateLedger } from "../src/validate";
import type { Category, Ledger } from "../src/types";

const SEEDS = [42, 1, 2, 3, 4];

function payments(ledger: Ledger, from: Set<string>) {
  const info = new Map(ledger.wallets.map((w) => [w.addr, w]));
  return ledger.transfers
    .filter((t) => from.has(t.from) && info.get(t.to)?.kind === "service")
    .map((t) => ({ ...t, category: info.get(t.to)!.category as Category }));
}

describe("simulate", () => {
  it("is deterministic", () => {
    expect(simulate(42)).toEqual(simulate(42));
    expect(simulate(42, "shield")).toEqual(simulate(42, "shield"));
    expect(simulate(1).ledger.transfers[0]).not.toEqual(simulate(2).ledger.transfers[0]);
  });

  it.each(SEEDS)("seed %i produces a valid ledger and ground truth in both modes", (seed) => {
    for (const mode of ["open", "shield"] as const) {
      const { ledger, truth } = simulate(seed, mode);
      expect(validateLedger(ledger)).toEqual([]);
      expect(validateGroundTruth(truth)).toEqual([]);
      const unlabelled = ledger.wallets.filter((w) => w.kind === "").map((w) => w.addr).sort();
      expect(Object.values(truth.owners).flat().sort()).toEqual(unlabelled);
    }
  });

  it.each(SEEDS)("seed %i: unlabelled→unlabelled transfers only within one owner", (seed) => {
    for (const mode of ["open", "shield"] as const) {
      const { ledger, truth } = simulate(seed, mode);
      const owner = new Map(Object.entries(truth.owners).flatMap(([id, as]) => as.map((a) => [a, id])));
      const cross = ledger.transfers.filter((t) => owner.has(t.from) && owner.has(t.to) && owner.get(t.from) !== owner.get(t.to));
      expect(cross).toEqual([]);
    }
  });

  it("'you' (open): 4 wallets, 238 agent payments, tuned category counts", () => {
    const { ledger, truth, you } = simulate(42);
    expect(truth.owners.you).toHaveLength(4);
    expect(you.agents).toHaveLength(3);
    const pays = payments(ledger, new Set(you.agents));
    expect(pays).toHaveLength(238);
    const counts = Object.fromEntries([...Map.groupBy(pays, (p) => p.category)].map(([c, ps]) => [c, ps.length]));
    expect(counts).toEqual({ Career: 70, Finance: 12, Legal: 6, Developer: 4, Health: 36, Travel: 110 });
  });

  it("'you': travel agent funded only from an exchange; others from the personal wallet", () => {
    const { ledger, you } = simulate(42);
    const info = new Map(ledger.wallets.map((w) => [w.addr, w]));
    const funders = you.agents.map((a) => ledger.transfers.filter((t) => t.to === a).map((t) => t.from));
    expect(funders[0]).toEqual([you.personal]);
    expect(funders[1]).toEqual([you.personal]);
    expect(funders[2]!.map((f) => info.get(f)!.label)).toEqual(["Exchange A"]);
    const anchor = ledger.transfers.filter((t) => t.to === you.personal).map((t) => info.get(t.from)!.label);
    expect(anchor).toEqual(["Exchange A"]);
  });

  it("'you': agents silent exactly 01:00–09:00 local (UTC+05:30), active in every other slot", () => {
    const { ledger, you } = simulate(42);
    const hourly = Array<number>(48).fill(0);
    for (const p of payments(ledger, new Set(you.agents))) hourly[Math.floor((p.ts % 86_400) / 1800)]! += 1;
    const empty = hourly.flatMap((n, i) => (n === 0 ? [i] : []));
    // 19:30–03:30 UTC = 01:00–09:00 local
    expect(empty).toEqual([0, 1, 2, 3, 4, 5, 6, 39, 40, 41, 42, 43, 44, 45, 46, 47]);
  });

  it("'you': health burst only on 24–26 Oct local", () => {
    const { ledger, you } = simulate(42);
    const health = payments(ledger, new Set(you.agents)).filter((p) => p.category === "Health");
    const localDays = new Set(health.map((p) => new Date((p.ts + 330 * 60) * 1000).getUTCDate()));
    expect([...localDays].sort()).toEqual([24, 25, 26]);
  });

  it("shield: same 'you' payments, each agent session from a fresh rail-funded one-time wallet", () => {
    const open = simulate(42, "open");
    const shield = simulate(42, "shield");
    const strip = (ps: { ts: number; amount: number; category: Category }[]) =>
      ps.map((p) => [p.ts, p.amount, p.category]).sort();
    const openPays = payments(open.ledger, new Set(open.you.agents));
    const shieldPays = payments(shield.ledger, new Set(shield.you.agents));
    expect(strip(shieldPays)).toEqual(strip(openPays));

    const rail = shield.ledger.wallets.find((w) => w.kind === "pool")!.addr;
    for (const w of shield.you.agents) {
      const inbound = shield.ledger.transfers.filter((t) => t.to === w);
      expect(inbound.map((t) => [t.from, t.amount])).toEqual([[rail, 1]]);
      const out = shield.ledger.transfers.filter((t) => t.from === w);
      expect(out.every((t) => t.to !== shield.you.personal)).toBe(true);
      expect(Math.max(...out.map((t) => t.ts)) - Math.min(...out.map((t) => t.ts))).toBeLessThanOrEqual(150);
      expect(inbound[0]!.ts).toBeLessThan(Math.min(...out.map((t) => t.ts)));
    }
    // the personal wallet only ever talks to the exchange and the rail
    const touched = shield.ledger.transfers.filter((t) => t.from === shield.you.personal).map((t) => t.to);
    expect(new Set(touched)).toEqual(new Set([rail]));
  });

  it("everything happens inside the 10-day window", () => {
    const { ledger } = simulate(42);
    expect(ledger.start_ts).toBe(START_TS);
    expect(new Date(START_TS * 1000).toISOString()).toBe("2026-10-18T00:00:00.000Z");
    for (const t of ledger.transfers) {
      expect(t.ts).toBeGreaterThanOrEqual(START_TS);
      expect(t.ts).toBeLessThan(START_TS + 10 * 86_400);
    }
  });
});
