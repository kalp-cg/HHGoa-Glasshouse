// `pnpm shield:export`: reads the real Base Sepolia USDC history around the Rail (deposits in, releases out, and the
// one-time wallets' payments) and writes it as a Ledger to packages/chain/exports/testnet.shield.json, labelled the
// way the analysis expects (Rail = pool, x402 seller = service). `pnpm demo:check` then runs the same analysis on it.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyze, oneTimePayments, validateLedger, type Address, type Ledger, type Transfer, type WalletInfo } from "../packages/engine/src/index";

const root = join(import.meta.dirname, "..");
const rpc = process.env.BASE_SEPOLIA_RPC_URL;
const rail = process.env.RAIL_ADDRESS?.toLowerCase() as Address | undefined;
const seller = process.env.X402_PAY_TO?.toLowerCase() as Address | undefined;
if (!rpc?.includes("alchemy.com") || !rail || !seller) {
  console.error("needs BASE_SEPOLIA_RPC_URL (Alchemy), RAIL_ADDRESS and X402_PAY_TO in .env");
  process.exit(1);
}
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const RAIL_DEPLOY_BLOCK = "0x313ff43"; // 51642179, the Rail's deployment

interface T { hash: string; from: string; to: string; value: number | null; metadata: { blockTimestamp: string } }
async function transfers(filter: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  let pageKey: string | undefined;
  do {
    const res = await fetch(rpc!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "alchemy_getAssetTransfers", params: [{
        fromBlock: RAIL_DEPLOY_BLOCK, toBlock: "latest", category: ["erc20"], contractAddresses: [USDC],
        withMetadata: true, excludeZeroValue: true, maxCount: "0x3e8", ...filter, ...(pageKey ? { pageKey } : {}),
      }] }),
    });
    const body = (await res.json()) as { result?: { transfers: T[]; pageKey?: string }; error?: { message: string } };
    if (!body.result) throw new Error(`Alchemy: ${body.error?.message ?? res.status}`);
    out.push(...body.result.transfers);
    pageKey = body.result.pageKey;
  } while (pageKey);
  return out;
}

const deposits = await transfers({ toAddress: rail });
const releases = await transfers({ fromAddress: rail });
const oneTime = [...new Set(releases.map((t) => t.to.toLowerCase()))];
const payments = (await Promise.all(oneTime.map((w) => transfers({ fromAddress: w })))).flat();

const all: Transfer[] = [...deposits, ...releases, ...payments].filter((t) => t.value !== null).map((t) => ({
  tx: t.hash.toLowerCase(),
  from: t.from.toLowerCase() as Address,
  to: t.to.toLowerCase() as Address,
  amount: t.value!,
  ts: Math.floor(Date.parse(t.metadata.blockTimestamp) / 1000),
})).sort((a, b) => a.ts - b.ts || a.tx.localeCompare(b.tx));

const label = (a: Address): WalletInfo =>
  a === rail ? { addr: a, kind: "pool", label: "Shield Rail (Base Sepolia)", category: null }
  : a === seller ? { addr: a, kind: "service", label: "x402 test service", category: "Developer" }
  : { addr: a, kind: "", label: "", category: null };
const wallets = [...new Set(all.flatMap((t) => [t.from, t.to]))].sort().map(label);
const start = all[0]?.ts ?? Math.floor(Date.now() / 1000);
const ledger: Ledger = { seed: 0, start_ts: start, days: Math.max(0, ((all.at(-1)?.ts ?? start) - start) / 86_400), wallets, transfers: all };

const problems = validateLedger(ledger);
if (problems.length) throw new Error(`not a valid Ledger: ${problems.slice(0, 3).join("; ")}`);
const pays = oneTimePayments(ledger);
const linked = analyze(ledger).filter((l) => oneTime.includes(l.a) || oneTime.includes(l.b));
mkdirSync(join(root, "packages/chain/exports"), { recursive: true });
writeFileSync(join(root, "packages/chain/exports/testnet.shield.json"), JSON.stringify(ledger, null, 2) + "\n");
console.log(`deposits ${deposits.length}, releases ${releases.length}, one-time wallets ${oneTime.length}, x402 payments ${pays.length}, links touching a one-time wallet ${linked.length}`);
for (const p of pays) console.log(`  payment ${p.tx} (${p.amount} USDC) https://sepolia.basescan.org/tx/${p.tx}`);
