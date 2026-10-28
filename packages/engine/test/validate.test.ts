import { describe, expect, it } from "vitest";
import { validateGraphView, validateGroundTruth, validateLedger, validateProfileFacts } from "../src/validate";

const A = "0x00000000000000000000000000000000000000aa";
const B = "0x00000000000000000000000000000000000000bb";

const profile = {
  mode: "open", seed_wallet: A, wallets: [{ addr: A, role: "personal" }], links: [],
  identity_anchor: null, timezone: null, hourly: Array(48).fill(0), signals: [],
  spend: { payments: 0, usdc: 0 }, linkability: { traced: 0, total: 0 }, anonymity_set: null, source: "synthetic",
};

describe("validators", () => {
  it("accept well-formed values", () => {
    expect(validateLedger({
      seed: 1, start_ts: 0, days: 1,
      wallets: [{ addr: A, kind: "", label: "", category: null }, { addr: B, kind: "service", label: "S", category: "Health" }],
      transfers: [{ tx: "0x1", from: A, to: B, amount: 0.01, ts: 5 }],
    })).toEqual([]);
    expect(validateGroundTruth({ owners: { you: [A] } })).toEqual([]);
    expect(validateProfileFacts(profile)).toEqual([]);
    expect(validateGraphView({ nodes: [{ id: A, label: "", kind: "one-time", owned: true }], edges: [] })).toEqual([]);
  });

  it("reject malformed values", () => {
    expect(validateLedger({ seed: 1, start_ts: 0, days: 1, wallets: [], transfers: [{ tx: "0x1", from: A, to: B, amount: 1, ts: 0 }] }))
      .toContain("transfers[0] from/to must be listed wallets");
    expect(validateLedger({ seed: 1, start_ts: 0, days: 1, wallets: [{ addr: A, kind: "service", label: "", category: null }], transfers: [] }))
      .toHaveLength(1);
    expect(validateGroundTruth({ owners: { you: ["nope"] } })).toHaveLength(1);
    expect(validateProfileFacts({ ...profile, hourly: [1, 2] })).toContain("hourly must be 48 integers");
    expect(validateProfileFacts({ ...profile, linkability: { traced: 3, total: 2 } })).toContain("linkability invalid");
    expect(validateGraphView({ nodes: [], edges: [{ source: A, target: B, type: "TRANSFER", label: "" }] }))
      .toContain("edges[0] must join listed nodes");
  });
});
