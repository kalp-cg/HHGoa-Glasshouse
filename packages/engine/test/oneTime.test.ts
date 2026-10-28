import { describe, expect, it } from "vitest";
import { oneTimePayments } from "../src/oneTime";
import { simulate } from "../src/simulate";

describe("oneTimePayments", () => {
  it("shield: every payment by the person's one-time wallets is found", () => {
    const { ledger, you } = simulate(42, "shield");
    const mine = oneTimePayments(ledger).filter((t) => you.agents.includes(t.from));
    expect(mine).toHaveLength(238);
  });

  it("open: the person's agents are not one-time wallets", () => {
    const { ledger, you } = simulate(42, "open");
    expect(oneTimePayments(ledger).filter((t) => you.agents.includes(t.from))).toEqual([]);
  });

  it("a wallet also funded by anything other than the pool is excluded", () => {
    const { ledger, you } = simulate(42, "shield");
    const otw = you.agents[0]!;
    const tainted = { ...ledger, transfers: [...ledger.transfers, { tx: "0xdead", from: you.personal, to: otw, amount: 1, ts: ledger.start_ts + 10 }] };
    expect(oneTimePayments(tainted).some((t) => t.from === otw)).toBe(false);
  });
});
