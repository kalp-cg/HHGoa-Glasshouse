import { describe, expect, it } from "vitest";
import { analyze } from "../src/analyze";
import { cluster, inferTimezone, offsetLabel, profile } from "../src/profile";
import { simulate } from "../src/simulate";
import type { Address, SameOwnerLink } from "../src/types";

const a = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
const link = (x: number, y: number): SameOwnerLink => ({ a: a(x), b: a(y), rule: "funding", detail: "" });

describe("cluster", () => {
  it("walks SAME_OWNER links transitively, seed first", () => {
    expect(cluster(a(1), [link(1, 2), link(3, 2), link(8, 9)])).toEqual([a(1), a(2), a(3)]);
    expect(cluster(a(5), [])).toEqual([a(5)]);
  });
});

describe("inferTimezone", () => {
  const busyExcept = (emptyFrom: number, len: number) => {
    const h = Array<number>(48).fill(1);
    for (let i = 0; i < len; i++) h[(emptyFrom + i) % 48] = 0;
    return h;
  };

  it("centres the longest gap on 05:00 local", () => {
    // empty 19:30–03:30 UTC (centre 23:30) → UTC+05:30
    expect(inferTimezone(busyExcept(39, 16))).toEqual({
      offset_minutes: 330, label: "UTC+05:30", sleep_start_local: "01:00", sleep_end_local: "09:00",
    });
    // empty 06:00–14:00 UTC (centre 10:00) → UTC-05:00
    expect(inferTimezone(busyExcept(12, 16))?.label).toBe("UTC-05:00");
  });

  it("snaps to the nearest real offset", () => {
    // empty 19:30–03:00 UTC (centre 23:15) → raw +05:45, which is real (Nepal)
    expect(inferTimezone(busyExcept(39, 15))?.offset_minutes).toBe(345);
  });

  it("returns null with < 15 payments or no 5–15 h gap", () => {
    const sparse = Array<number>(48).fill(0);
    sparse[10] = 14;
    expect(inferTimezone(sparse)).toBeNull();
    expect(inferTimezone(busyExcept(0, 8))).toBeNull();   // 4 h gap
    expect(inferTimezone(busyExcept(0, 32))).toBeNull();  // 16 h gap
  });

  it("formats labels", () => {
    expect(offsetLabel(0)).toBe("UTC+00:00");
    expect(offsetLabel(-210)).toBe("UTC-03:30");
  });
});

describe("profile (Gate 1, seed 42)", () => {
  it("open: 4 wallets, UTC+05:30, 5 signals, 238/238", () => {
    const { ledger, you } = simulate(42, "open");
    const p = profile(ledger, analyze(ledger), you.personal, { mode: "open" });
    expect(p.wallets).toHaveLength(4);
    expect(p.wallets.map((w) => w.role).sort()).toEqual(["agent", "agent", "agent", "personal"]);
    expect(p.timezone?.offset_minutes).toBe(330);
    expect(p.signals.map((s) => s.category)).toEqual(["Travel", "Career", "Health", "Finance", "Legal"]);
    expect(p.linkability).toEqual({ traced: 238, total: 238 });
    expect(p.identity_anchor).toEqual({ exchange_label: "Exchange A" });
    expect(p.hourly.reduce((s, n) => s + n, 0)).toBe(238);
    expect(p.anonymity_set).toBeNull();
    const health = p.signals.find((s) => s.category === "Health")!;
    const localDate = (ts: number) => new Date((ts + 330 * 60) * 1000).toISOString().slice(0, 10);
    expect([localDate(health.first_ts), localDate(health.last_ts)]).toEqual(["2026-10-24", "2026-10-26"]);
  });

  it("shield: same analysis traces 0 of 238 and reports a crowd", () => {
    const { ledger, you } = simulate(42, "shield");
    const p = profile(ledger, analyze(ledger), you.personal, { mode: "shield", ownWallets: you.agents });
    expect(p.wallets).toEqual([{ addr: you.personal, role: "personal" }]);
    expect(p.links).toEqual([]);
    expect(p.linkability).toEqual({ traced: 0, total: 238 });
    expect(p.timezone).toBeNull();
    expect(p.signals).toEqual([]);
    expect(p.anonymity_set).toBeGreaterThan(100);
  });

  it("payments to services of unknown category count, but give no signal", () => {
    const { ledger, you } = simulate(42, "open");
    const blind = { ...ledger, wallets: ledger.wallets.map((w) => (w.kind === "service" ? { ...w, category: null } : w)) };
    const p = profile(blind, analyze(blind), you.personal, { mode: "open" });
    expect(p.linkability).toEqual({ traced: 238, total: 238 });
    expect(p.signals).toEqual([]);
    expect(p.timezone?.offset_minutes).toBe(330);
  });

  it("a one-time wallet as seed links to nothing", () => {
    const { ledger, you } = simulate(42, "shield");
    const p = profile(ledger, analyze(ledger), you.agents[0]!, { mode: "shield" });
    expect(p.wallets).toEqual([{ addr: you.agents[0], role: "one-time" }]);
  });
});
