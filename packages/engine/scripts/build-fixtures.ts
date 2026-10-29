// Writes fixtures/ for seed 42: the simulated ledgers and ground truth, plus the profile and
// graph the engine produces from them. Ground truth is written for tests only and never read here.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "../src/analyze";
import { graphView } from "../src/graphView";
import { profile } from "../src/profile";
import { simulate } from "../src/simulate";

const SEED = 42;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures");

mkdirSync(OUT, { recursive: true });
const write = (name: string, data: unknown) =>
  writeFileSync(join(OUT, name), JSON.stringify(data, null, name.startsWith("ledger") ? 0 : 2) + "\n");

for (const mode of ["open", "shield"] as const) {
  const sim = simulate(SEED, mode);
  // shield: the owner knows their own one-time wallets from their session (for the total only)
  const ownWallets = mode === "shield" ? sim.you.agents : [];
  const facts = profile(sim.ledger, analyze(sim.ledger), sim.you.personal, { mode, ownWallets });
  const suffix = mode === "open" ? "" : ".shield";
  write(`ledger.seed42${suffix}.json`, sim.ledger);
  write(`truth.seed42${suffix}.json`, sim.truth);
  write(`profile.${mode}.json`, facts);
  write(`graph.${mode}.json`, graphView(sim.ledger, facts, ownWallets));
}
// Cake Wallet sandbox: the same Shield world, but "you" topped up through a private swap in Cake Wallet
const cake = simulate(SEED, "shield", "cake");
write("profile.shield.cake.json", profile(cake.ledger, analyze(cake.ledger), cake.you.personal, { mode: "shield", ownWallets: cake.you.agents }));
console.log(`fixtures written to ${OUT}`);
