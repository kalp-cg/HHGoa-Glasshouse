// Base USDC history of one wallet through Alchemy's transfer API (alchemy_getAssetTransfers), which has no block-range
// limit on the free plan, unlike eth_getLogs (10 blocks). Request/response shape verified live against Base mainnet.
// x402-style payments: outgoing USDC transfers whose transaction was submitted by someone else (the x402 facilitator
// pays the gas). Not every gasless transfer is x402.
import type { Address, Ledger, Transfer, WalletInfo } from "@glasshouse/engine";
import { BASE_USDC } from "./constants";

export type Post = (body: unknown) => Promise<unknown>;

interface AssetTransfer { hash: string; from: string; to: string; value: number | null; metadata: { blockTimestamp: string } }

const hex = (n: bigint) => `0x${n.toString(16)}`;
const MAX_PAGES = 50;      // 50,000 transfers per direction is more than any single audit should read
const BATCH = 20;          // the free plan caps compute units per second; small batches, retried on 429
const RETRIES = 8;

const isRateLimit = (e: { code?: number; message?: string } | undefined) => e?.code === 429 || /compute units|rate limit/i.test(e?.message ?? "");

// Retries a whole request while Alchemy answers "429"; backoff 0.5 s, 1 s, 2 s, ... capped at 4 s.
async function withRetry<T>(post: Post, body: unknown, ok: (res: unknown) => T, sleepMs: number): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await post(body);
    const limited = (Array.isArray(res) ? res : [res]).some((r) => isRateLimit((r as { error?: { code?: number; message?: string } }).error));
    if (!limited || attempt >= RETRIES) return ok(res);
    await new Promise((r) => setTimeout(r, Math.min(sleepMs * 2 ** (attempt - 1), 4000)));
  }
}

let sleepMs = 500;
/** tests only */
export const setRetrySleep = (ms: number) => { sleepMs = ms; };

async function rpc<T>(post: Post, method: string, params: unknown[]): Promise<T> {
  const res = await withRetry(post, { jsonrpc: "2.0", id: 1, method, params }, (r) => r as { result?: T; error?: { message: string } }, sleepMs);
  if (res.error || res.result === undefined) throw new Error(`Alchemy ${method}: ${res.error?.message ?? "no result"}`);
  return res.result;
}

async function batch<T>(post: Post, calls: { method: string; params: unknown[] }[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < calls.length; i += BATCH) {
    const chunk = calls.slice(i, i + BATCH);
    const res = await withRetry(post, chunk.map((c, id) => ({ jsonrpc: "2.0", id, method: c.method, params: c.params })),
      (r) => r as { id: number; result?: T; error?: { message: string } }[], sleepMs);
    if (!Array.isArray(res)) throw new Error("Alchemy batch: unexpected response");
    for (const r of res) if (r.error) throw new Error(`Alchemy batch: ${r.error.message}`);
    out.push(...[...res].sort((a, b) => a.id - b.id).map((r) => r.result as T));
  }
  return out;
}

async function allTransfers(post: Post, params: Record<string, unknown>): Promise<AssetTransfer[]> {
  const out: AssetTransfer[] = [];
  let pageKey: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await rpc<{ transfers: AssetTransfer[]; pageKey?: string }>(post, "alchemy_getAssetTransfers", [{ ...params, ...(pageKey ? { pageKey } : {}) }]);
    out.push(...res.transfers);
    pageKey = res.pageKey;
    if (!pageKey) break;
  }
  return out;
}

// Checking who submitted every transaction is slow on the free plan (about 50 ms each), so a busy wallet is sampled:
// up to maxLookups evenly spaced transactions are checked; if at least half of those were submitted by someone else,
// all of the wallet's outgoing USDC payments are treated as x402-style (an agent wallet), else only the checked ones that were.
export const MAX_SENDER_LOOKUPS = 300;

export async function fetchAlchemyLedger(address: Address, opts: { fromBlock: bigint; toBlock: bigint }, post: Post, cfg: { maxLookups?: number } = {}): Promise<Ledger> {
  const me = address.toLowerCase() as Address;
  const base = {
    fromBlock: hex(opts.fromBlock), toBlock: hex(opts.toBlock), category: ["erc20"], contractAddresses: [BASE_USDC],
    withMetadata: true, excludeZeroValue: true, maxCount: "0x3e8", order: "asc",
  };
  const [outgoing, incoming] = [await allTransfers(post, { ...base, fromAddress: me }), await allTransfers(post, { ...base, toAddress: me })];

  const hashes = [...new Set(outgoing.map((t) => t.hash))];
  const cap = cfg.maxLookups ?? MAX_SENDER_LOOKUPS;
  const stride = Math.max(1, Math.ceil(hashes.length / cap));
  const checked = hashes.filter((_, i) => i % stride === 0);
  const txs = await batch<{ from: string } | null>(post, checked.map((h) => ({ method: "eth_getTransactionByHash", params: [h] })));
  const submitter = new Map(checked.map((h, i) => [h, txs[i]?.from?.toLowerCase()]));
  const facilitated = checked.filter((h) => submitter.get(h) !== me).length;
  const agentWallet = stride > 1 && facilitated * 2 >= checked.length;
  const x402 = outgoing.filter((t) => (submitter.has(t.hash) ? submitter.get(t.hash) !== me : agentWallet));

  const unique = new Map<string, Transfer>();
  for (const t of [...x402, ...incoming]) {
    if (t.value === null) continue;
    const tx = t.hash.toLowerCase();
    const from = t.from.toLowerCase() as Address, to = t.to.toLowerCase() as Address;
    unique.set(`${tx}:${from}:${to}:${t.value}`, { tx, from, to, amount: t.value, ts: Math.floor(Date.parse(t.metadata.blockTimestamp) / 1000) });
  }
  const transfers = [...unique.values()].sort((a, b) => a.ts - b.ts || a.tx.localeCompare(b.tx));

  const [first, last] = await batch<{ timestamp: string } | null>(post, [opts.fromBlock, opts.toBlock].map((b) => ({ method: "eth_getBlockByNumber", params: [hex(b), false] })));
  const startTs = first ? Number(BigInt(first.timestamp)) : (transfers[0]?.ts ?? 0);
  const endTs = last ? Number(BigInt(last.timestamp)) : (transfers.at(-1)?.ts ?? startTs);

  const addrs = new Set<Address>([me, ...transfers.flatMap((t) => [t.from, t.to])]);
  const wallets: WalletInfo[] = [...addrs].sort().map((addr) => ({ addr, kind: "", label: "", category: null }));
  return { seed: 0, start_ts: startTs, days: Math.max(0, (endTs - startTs) / 86_400), wallets, transfers };
}
