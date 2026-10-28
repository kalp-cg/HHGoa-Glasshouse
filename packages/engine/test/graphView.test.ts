import { describe, expect, it } from "vitest";
import { analyze } from "../src/analyze";
import { graphView } from "../src/graphView";
import { profile } from "../src/profile";
import { simulate } from "../src/simulate";
import { validateGraphView } from "../src/validate";

describe("graphView", () => {
  it("open: valid, < 300 nodes, 4 owned wallets, 3 SAME_OWNER edges", () => {
    const { ledger, you } = simulate(42, "open");
    const facts = profile(ledger, analyze(ledger), you.personal, { mode: "open" });
    const g = graphView(ledger, facts);
    expect(validateGraphView(g)).toEqual([]);
    expect(g.nodes.length).toBeLessThan(300);
    expect(g.nodes.filter((n) => n.owned).map((n) => n.label).sort())
      .toEqual(["Your agent 1", "Your agent 2", "Your agent 3", "Your wallet"]);
    expect(g.edges.filter((e) => e.type === "SAME_OWNER")).toHaveLength(3);
  });

  it("shield: one-time wallets drawn but not owned, no SAME_OWNER edges", () => {
    const { ledger, you } = simulate(42, "shield");
    const facts = profile(ledger, analyze(ledger), you.personal, { mode: "shield", ownWallets: you.agents });
    const g = graphView(ledger, facts, you.agents);
    expect(validateGraphView(g)).toEqual([]);
    expect(g.nodes.length).toBeLessThan(300);
    expect(g.nodes.filter((n) => n.owned)).toHaveLength(1);
    const oneTime = g.nodes.filter((n) => n.kind === "one-time");
    expect(oneTime.length).toBeGreaterThan(you.agents.length);
    expect(oneTime.every((n) => !n.owned)).toBe(true);
    expect(g.edges.filter((e) => e.type === "SAME_OWNER")).toEqual([]);
  });
});
