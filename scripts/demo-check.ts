// `pnpm demo:check`: prints every PLAYBOOK.md gate as PASS / FAIL / PENDING.
// PENDING = the thing that would prove it isn't built yet. Exit code 1 if anything FAILs.
// Each phase replaces its PENDING entries with real checks.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  analyze, profile, simulate, validateGraphView, validateGroundTruth, validateLedger, validateProfileFacts,
} from "../packages/engine/src/index";

type Status = "PASS" | "FAIL" | "PENDING";
interface Result { status: Status; note?: string }
interface Check { name: string; run: () => Result }

const root = join(import.meta.dirname, "..");
const pending = (note: string): Check["run"] => () => ({ status: "PENDING", note });

function command(cmd: string, args: string[]): Result {
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8" });
  if (r.status === 0) return { status: "PASS" };
  const tail = `${r.stdout}${r.stderr}`.trim().split("\n").slice(-3).join(" | ");
  return { status: "FAIL", note: tail };
}

// runs `cmd` only once its config file exists; until then the check is PENDING
const whenExists = (file: string, owner: string, cmd: string, args: string[]): Check["run"] => () =>
  existsSync(join(root, file)) ? command(cmd, args) : { status: "PENDING", note: `${owner}: ${file} not there yet` };

function engineSeed42(): Result {
  const open = simulate(42, "open");
  const p = profile(open.ledger, analyze(open.ledger), open.you.personal, { mode: "open" });
  const got = `${p.wallets.length} wallets, ${p.timezone?.label ?? "no time zone"}, ${p.signals.length} signals, ${p.linkability.traced}/${p.linkability.total}`;
  const ok = p.wallets.length === 4 && p.timezone?.offset_minutes === 330 && p.signals.length === 5
    && p.linkability.traced === 238 && p.linkability.total === 238;
  return { status: ok ? "PASS" : "FAIL", note: got };
}

function noFalseLinks(): Result {
  const bad: string[] = [];
  for (const seed of [1, 2, 3, 4]) {
    for (const mode of ["open", "shield"] as const) {
      const { ledger, truth } = simulate(seed, mode);
      const owner = new Map(Object.entries(truth.owners).flatMap(([id, as]) => as.map((a) => [a, id])));
      const n = analyze(ledger).filter((l) => owner.get(l.a) !== owner.get(l.b)).length;
      if (n > 0) bad.push(`seed ${seed} ${mode}: ${n}`);
    }
  }
  return bad.length ? { status: "FAIL", note: bad.join(", ") } : { status: "PASS" };
}

function fixtures(): Result {
  const validators: Record<string, (v: unknown) => string[]> = {
    "ledger.seed42.json": validateLedger,
    "ledger.seed42.shield.json": validateLedger,
    "truth.seed42.json": validateGroundTruth,
    "truth.seed42.shield.json": validateGroundTruth,
    "profile.open.json": validateProfileFacts,
    "profile.shield.json": validateProfileFacts,
    "graph.open.json": validateGraphView,
    "graph.shield.json": validateGraphView,
  };
  const problems: string[] = [];
  for (const [file, validate] of Object.entries(validators)) {
    const path = join(root, "fixtures", file);
    if (!existsSync(path)) {
      problems.push(`${file} missing`);
      continue;
    }
    problems.push(...validate(JSON.parse(readFileSync(path, "utf8"))).slice(0, 2).map((p) => `${file}: ${p}`));
  }
  return problems.length ? { status: "FAIL", note: problems.slice(0, 3).join("; ") } : { status: "PASS" };
}

const gates: { name: string; checks: Check[] }[] = [
  {
    name: "Gate 0 · Foundation",
    checks: [
      { name: "pnpm test passes", run: () => command("pnpm", ["test"]) },
      { name: "fixtures committed and match the types", run: fixtures },
    ],
  },
  {
    name: "Gate 1 · Attack works offline",
    checks: [
      { name: "engine seed 42: 4 wallets, UTC+05:30, 5 signals, 238/238", run: engineSeed42 },
      { name: "zero false links on seeds 1–4 (open and shield)", run: noFalseLinks },
      {
        name: "UI renders both fixtures, no console errors (Playwright)",
        run: whenExists("apps/web/playwright.config.ts", "Antigravity", "pnpm", ["--filter", "@glasshouse/web", "exec", "playwright", "test"]),
      },
      { name: "Rail contract tests green (forge test)", run: whenExists("contracts/foundry.toml", "Codex", "forge", ["test", "--root", "contracts"]) },
    ],
  },
  {
    name: "Gate 2 · TigerGraph parity + live API",
    checks: [
      { name: "pnpm test:parity: TigerGraph == engine on seed 42", run: pending("Phase 2") },
      { name: "API returns valid ProfileFacts", run: pending("Phase 2") },
      { name: "UI on live API, no visual change", run: pending("Antigravity Phase 2") },
    ],
  },
  {
    name: "Gate 3 · The fix works",
    checks: [
      { name: "shield: 0/238 traced via the same queries", run: pending("Phase 3") },
      { name: "real testnet x402 payment from a one-time wallet", run: pending("Codex Phase 3") },
    ],
  },
  {
    name: "Gate 4 · Live with real users",
    checks: [
      { name: "public URL deployed", run: pending("Phase 4") },
      { name: "own wallet audits; foreign wallet gets 401", run: pending("Phase 4") },
      { name: "usage counter increments", run: pending("Phase 4") },
      { name: "Dodo checkout opens (test mode)", run: pending("Phase 4") },
    ],
  },
  {
    name: "Gate 5 · Demo hardening",
    checks: [
      { name: "OFFLINE_MODE demo end to end", run: pending("Phase 5") },
    ],
  },
];

let failed = false;
for (const gate of gates) {
  console.log(`\n${gate.name}`);
  for (const check of gate.checks) {
    const r = check.run();
    failed ||= r.status === "FAIL";
    console.log(`  ${r.status.padEnd(7)} ${check.name}${r.note ? `  (${r.note})` : ""}`);
  }
}
console.log();
process.exit(failed ? 1 : 0);
