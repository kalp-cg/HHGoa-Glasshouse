// `pnpm tg:setup`: create the schema and install the GSQL queries. Safe to re-run.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { configFromEnv, createClient } from "../src/index";

const cfg = configFromEnv();
if (!cfg) {
  console.error("TG_HOST and TG_TOKEN must be set in .env");
  process.exit(1);
}
const client = createClient({ ...cfg, timeoutMs: 600_000 });
const root = join(import.meta.dirname, "..");
const withGraph = (gsql: string) => gsql.replaceAll("Glasshouse", cfg.graph);
// GSQL reports most failures inside a 200 response, as text
const failed = (out: string) => /(Semantic Check Fail|Syntax Error|Failed to|failed: [1-9]|exception|does not exist)/i.test(out);

const run = async (label: string, gsql: string) => {
  const out = await client.statements(gsql);
  console.log(`--- ${label}\n${out.trim()}`);
  if (failed(out)) throw new Error(`${label} failed`);
};

const graphExists = (await client.statements(`USE GRAPH ${cfg.graph}`)).includes(`Using graph '${cfg.graph}'`);
if (graphExists) console.log(`--- schema\ngraph ${cfg.graph} already exists, keeping it`);
else await run("schema", withGraph(readFileSync(join(root, "schema.gsql"), "utf8")));
const queries = readdirSync(join(root, "queries")).filter((f) => f.endsWith(".gsql")).sort();
for (const file of queries) {
  const text = withGraph(readFileSync(join(root, "queries", file), "utf8")).replace("CREATE QUERY", "CREATE OR REPLACE QUERY");
  await run(file, `USE GRAPH ${cfg.graph}\n${text}`);
}
await run("install", `USE GRAPH ${cfg.graph}\nINSTALL QUERY ${queries.map((f) => f.replace(".gsql", "")).join(", ")}`);
console.log("\nTigerGraph ready.");
