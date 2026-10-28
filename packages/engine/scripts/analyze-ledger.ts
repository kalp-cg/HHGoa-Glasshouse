// `pnpm analyze:ledger <ledger.json> <seed-wallet> [own-wallet,...]`
// Runs any Ledger (e.g. Codex's real Base Sepolia export) through the same analysis as the demo
// and prints the summary. own-wallets: the owner's one-time wallets (for the total only).
import { readFileSync } from "node:fs";
import { analyze, oneTimePayments, profile, validateLedger, type Address, type Ledger } from "../src/index";

const [file, seed, own = ""] = process.argv.slice(2);
if (!file || !seed) {
  console.error("usage: pnpm analyze:ledger <ledger.json> <seed-wallet> [own-wallet,...]");
  process.exit(1);
}
const ledger: unknown = JSON.parse(readFileSync(file, "utf8"));
const problems = validateLedger(ledger);
if (problems.length) {
  console.error(`not a valid Ledger:\n  ${problems.slice(0, 10).join("\n  ")}`);
  process.exit(1);
}
const l = ledger as Ledger;
const ownWallets = own.split(",").filter(Boolean).map((a) => a.toLowerCase() as Address);
const facts = profile(l, analyze(l), seed.toLowerCase() as Address, { mode: "shield", ownWallets });
console.log(JSON.stringify({
  transfers: l.transfers.length,
  one_time_payments: oneTimePayments(l).length,
  sample_one_time_txs: oneTimePayments(l).slice(0, 3).map((t) => t.tx),
  linked_wallets: facts.wallets.length,
  links: facts.links,
  linkability: facts.linkability,
  anonymity_set: facts.anonymity_set,
  timezone: facts.timezone,
  signals: facts.signals.map((s) => s.category),
}, null, 2));
