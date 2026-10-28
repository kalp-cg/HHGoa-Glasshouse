// `pnpm demo:check`: prints every PLAYBOOK.md gate as PASS / FAIL / PENDING.
// PENDING = the thing that would prove it isn't built yet. Exit code 1 if anything FAILs.
// Each phase replaces its PENDING entries with real checks.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  analyze, oneTimePayments, profile, simulate, validateGraphView, validateGroundTruth, validateLedger, validateProfileFacts,
} from "../packages/engine/src/index";

type Status = "PASS" | "FAIL" | "PENDING";
interface Result { status: Status; note?: string }
interface Check { name: string; run: () => Result }

const root = join(import.meta.dirname, "..");
if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));
const pending = (note: string): Check["run"] => () => ({ status: "PENDING", note });

function command(cmd: string, args: string[]): Result {
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8" });
  if (r.error) return { status: "FAIL", note: `${cmd} not runnable: ${r.error.message}` };
  if (r.status === 0) return { status: "PASS" };
  const tail = `${r.stdout}${r.stderr}`.trim().split("\n").slice(-3).join(" | ");
  return { status: "FAIL", note: tail };
}

// runs `cmd` only once its config file exists; until then the check is PENDING
const whenExists = (file: string, owner: string, cmd: string, args: string[]): Check["run"] => () =>
  existsSync(join(root, file)) ? command(cmd, args) : { status: "PENDING", note: `${owner}: ${file} not there yet` };

// parity also asserts Gate 3 (shield 0/238 via TigerGraph); run it once per demo:check
let parityResult: Result | undefined;
function parity(): Result {
  if (!process.env.TG_HOST?.trim() || !process.env.TG_TOKEN?.trim()) {
    return { status: "PENDING", note: "TG_HOST / TG_TOKEN not set in .env" };
  }
  // data stays in TigerGraph between runs; `pnpm test:parity` (without --no-load) reloads it
  return (parityResult ??= command("pnpm", ["test:parity", "--no-load"]));
}

function shieldViaTigerGraph(): Result {
  const { ledger, you } = simulate(42, "shield");
  const p = profile(ledger, analyze(ledger), you.personal, { mode: "shield", ownWallets: you.agents });
  const engine = `engine: ${p.linkability.traced}/${p.linkability.total}, crowd of ${p.anonymity_set}`;
  const tg = parity();
  return { status: tg.status, note: tg.status === "PENDING" ? `${engine}; TigerGraph: ${tg.note}` : engine };
}

// Codex exports real Base Sepolia one-time-wallet payments here (see HANDOFF.md, Phase 3)
const TESTNET_EXPORT = "packages/chain/exports/testnet.shield.json";
function testnetPayment(): Result {
  const path = join(root, TESTNET_EXPORT);
  if (!existsSync(path)) return { status: "PENDING", note: `Codex: ${TESTNET_EXPORT} not there yet` };
  const ledger: unknown = JSON.parse(readFileSync(path, "utf8"));
  const problems = validateLedger(ledger);
  if (problems.length) return { status: "FAIL", note: `not a valid Ledger: ${problems[0]}` };
  const l = ledger as Parameters<typeof oneTimePayments>[0];
  const pays = oneTimePayments(l);
  if (pays.length === 0) return { status: "FAIL", note: "no payment from a rail-funded one-time wallet" };
  const oneTime = new Set(pays.map((t) => t.from));
  const linked = analyze(l).filter((k) => oneTime.has(k.a) || oneTime.has(k.b)).length;
  if (linked > 0) return { status: "FAIL", note: `analysis linked a one-time wallet ${linked} time(s)` };
  return { status: "PASS", note: `${pays.length} payment(s), e.g. tx ${pays[0]!.tx}` };
}

// The Playwright smoke runs the same assertions on the live API and on ?fixtures=1, with OFFLINE_MODE=true;
// several gates read its one result.
let playwrightResult: Result | undefined;
function playwright(): Result {
  return (playwrightResult ??= whenExists("apps/web/playwright.config.ts", "UI", "pnpm", ["--filter", "@glasshouse/web", "exec", "playwright", "test"])());
}

// Real signatures against the audit routes (apps/web/app/api/_tests/phase4.test.ts)
let phase4Result: Result | undefined;
function phase4(): Result {
  return (phase4Result ??= command("pnpm", ["--filter", "@glasshouse/web", "exec", "vitest", "run", "app/api/_tests/phase4.test.ts"]));
}

const dodo = (): Result => process.env.DODO_API_KEY && process.env.DODO_PRODUCT_ID
  ? { status: "PENDING", note: "keys set; open /api/checkout on the deployed site to confirm" }
  : { status: "PENDING", note: "DODO_API_KEY / DODO_PRODUCT_ID not set in .env" };

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
        run: playwright,
      },
      { name: "Rail contract tests green (forge test)", run: whenExists("contracts/foundry.toml", "Codex", "forge", ["test", "--root", "contracts"]) },
    ],
  },
  {
    name: "Gate 2 · TigerGraph parity + live API",
    checks: [
      { name: "pnpm test:parity: TigerGraph == engine on seed 42", run: parity },
      { name: "API returns valid ProfileFacts (route tests, offline)", run: () => command("pnpm", ["--filter", "@glasshouse/web", "test"]) },
      { name: "UI on live API, no visual change (same smoke on API and ?fixtures=1)", run: playwright },
    ],
  },
  {
    name: "Gate 3 · The fix works",
    checks: [
      { name: "shield: 0/238 traced via the same queries (TigerGraph)", run: shieldViaTigerGraph },
      { name: "real testnet x402 payment from a one-time wallet, 0 links", run: testnetPayment },
      { name: "tx hash shown in the UI", run: pending("panel built (Shield mode → Run a real Shield session); needs a funded relayer + RAIL_ADDRESS + RELAYER_URL") },
    ],
  },
  {
    name: "Gate 4 · Live with real users",
    checks: [
      { name: "public URL deployed", run: pending("needs a Vercel login (VERCEL_TOKEN)") },
      { name: "own wallet audits; foreign wallet gets 401 (real signatures, route tests)", run: phase4 },
      { name: "usage counter increments, totals only", run: phase4 },
      { name: "Dodo checkout opens (test mode)", run: dodo },
    ],
  },
  {
    name: "Gate 5 · Demo hardening",
    checks: [
      { name: "OFFLINE_MODE demo end to end (Playwright runs with OFFLINE_MODE=true)", run: playwright },
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
