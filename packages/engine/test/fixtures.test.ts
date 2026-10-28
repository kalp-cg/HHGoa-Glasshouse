// Gate 0: committed fixtures match the types and the generator.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyze } from "../src/analyze";
import { graphView } from "../src/graphView";
import { profile } from "../src/profile";
import { simulate } from "../src/simulate";
import { validateGraphView, validateGroundTruth, validateLedger, validateProfileFacts } from "../src/validate";
import type { GraphView, ProfileFacts } from "../src/types";

const dir = join(import.meta.dirname, "../../../fixtures");
const load = (name: string): unknown => JSON.parse(readFileSync(join(dir, name), "utf8"));

describe("fixtures", () => {
  it("match the CONTRACTS.md types", () => {
    expect(validateLedger(load("ledger.seed42.json"))).toEqual([]);
    expect(validateLedger(load("ledger.seed42.shield.json"))).toEqual([]);
    expect(validateGroundTruth(load("truth.seed42.json"))).toEqual([]);
    expect(validateGroundTruth(load("truth.seed42.shield.json"))).toEqual([]);
    expect(validateProfileFacts(load("profile.open.json"))).toEqual([]);
    expect(validateProfileFacts(load("profile.shield.json"))).toEqual([]);
    expect(validateGraphView(load("graph.open.json"))).toEqual([]);
    expect(validateGraphView(load("graph.shield.json"))).toEqual([]);
  });

  it("ledgers and truth are what the generator produces for seed 42 (run `pnpm fixtures` if this fails)", () => {
    const open = simulate(42, "open");
    const shield = simulate(42, "shield");
    expect(load("ledger.seed42.json")).toEqual(open.ledger);
    expect(load("ledger.seed42.shield.json")).toEqual(shield.ledger);
    expect(load("truth.seed42.json")).toEqual(open.truth);
    expect(load("truth.seed42.shield.json")).toEqual(shield.truth);
  });

  it("profiles and graphs are what the engine produces (run `pnpm fixtures` if this fails)", () => {
    for (const mode of ["open", "shield"] as const) {
      const sim = simulate(42, mode);
      const own = mode === "shield" ? sim.you.agents : [];
      const facts = profile(sim.ledger, analyze(sim.ledger), sim.you.personal, { mode, ownWallets: own });
      expect(load(`profile.${mode}.json`)).toEqual(facts);
      expect(load(`graph.${mode}.json`)).toEqual(graphView(sim.ledger, facts, own));
    }
  });

  it("profiles carry the demo numbers", () => {
    const open = load("profile.open.json") as ProfileFacts;
    expect(open.wallets).toHaveLength(4);
    expect(open.timezone?.offset_minutes).toBe(330);
    expect(open.signals).toHaveLength(5);
    expect(open.linkability).toEqual({ traced: 238, total: 238 });
    expect(open.seed_wallet).toBe(simulate(42).you.personal);

    const shield = load("profile.shield.json") as ProfileFacts;
    expect(shield.linkability).toEqual({ traced: 0, total: 238 });
    expect(shield.anonymity_set).toBeGreaterThan(100);
    expect(shield.seed_wallet).toBe(open.seed_wallet);
  });

  it("graphs stay under 300 nodes and highlight only linked wallets", () => {
    for (const [mode, owned] of [["open", 4], ["shield", 1]] as const) {
      const g = load(`graph.${mode}.json`) as GraphView;
      expect(g.nodes.length).toBeLessThanOrEqual(300);
      expect(g.nodes.filter((n) => n.owned)).toHaveLength(owned);
    }
  });
});
