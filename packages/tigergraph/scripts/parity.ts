// `pnpm test:parity`: load seed 42 (open and shield) into TigerGraph, run the GSQL queries,
// and require exactly the engine's answers: same SAME_OWNER links, same person behind the seed.
// Gate 3: with TigerGraph's links, Shield mode traces 0 of 238 and reports a crowd.
import { analyze, cluster, profile, simulate } from "@glasshouse/engine";
import { configFromEnv, createClient, loadLedger, normalizeLinks, tgLinks, tgMembers, writeSameOwner } from "../src/index";

const cfg = configFromEnv();
if (!cfg) {
  console.error("TG_HOST and TG_TOKEN must be set in .env (run `pnpm tg:setup` first)");
  process.exit(1);
}
const client = createClient({ ...cfg, timeoutMs: 120_000 });
let ok = true;

for (const mode of ["open", "shield"] as const) {
  const { ledger, you } = simulate(42, mode);
  const batches = await loadLedger(client, ledger, mode);
  const tg = await tgLinks(client, ledger, mode);
  await writeSameOwner(client, mode, tg);
  const engine = analyze(ledger);

  const a = normalizeLinks(engine), b = normalizeLinks(tg);
  const onlyEngine = a.filter((x) => !b.includes(x)), onlyTg = b.filter((x) => !a.includes(x));
  const membersTg = (await tgMembers(client, mode, you.personal)).sort();
  const membersEngine = cluster(you.personal, engine).sort();
  const linksMatch = onlyEngine.length === 0 && onlyTg.length === 0;
  const membersMatch = JSON.stringify(membersTg) === JSON.stringify(membersEngine);

  console.log(`${mode}: loaded in ${batches} batches; links engine=${a.length} tigergraph=${b.length}; person: ${membersEngine.length} wallets`);
  console.log(`  ${linksMatch ? "PASS" : "FAIL"} links identical`);
  for (const x of onlyEngine.slice(0, 5)) console.log(`    only engine:     ${x}`);
  for (const x of onlyTg.slice(0, 5)) console.log(`    only tigergraph: ${x}`);
  console.log(`  ${membersMatch ? "PASS" : "FAIL"} owner_profile walk == engine cluster`);
  ok &&= linksMatch && membersMatch;

  if (mode === "shield") {
    const facts = profile(ledger, tg, you.personal, { mode, ownWallets: you.agents });
    const gate3 = facts.linkability.traced === 0 && facts.linkability.total === 238 && (facts.anonymity_set ?? 0) > 0;
    console.log(`  ${gate3 ? "PASS" : "FAIL"} shield via TigerGraph: ${facts.linkability.traced}/${facts.linkability.total} traced, crowd of ${facts.anonymity_set}`);
    ok &&= gate3;
  }
}
process.exit(ok ? 0 : 1);
