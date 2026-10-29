import type { Address, Ledger, Transfer, WalletInfo } from "@glasshouse/engine";
import { createPublicClient, http, parseAbiItem, type Log } from "viem";
import { base } from "viem/chains";

// viem public-client and getLogs APIs: https://viem.sh/docs/clients/public and https://viem.sh/docs/actions/public/getLogs
import { BASE_USDC } from "./constants";
import { fetchAlchemyLedger } from "./ingestAlchemy";
export { BASE_USDC };
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const AUTHORIZATION_USED = parseAbiItem("event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)");
const PAGE_SIZE = 500n;
const RETRIES = 3;

type TransferLog = Log<bigint, number, false, typeof TRANSFER>;
type AuthorizationLog = Log<bigint, number, false, typeof AUTHORIZATION_USED>;

function retry<T>(request: () => Promise<T>): Promise<T> {
  return retryAttempt(request, 0);
}

async function retryAttempt<T>(request: () => Promise<T>, attempt: number): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (attempt >= RETRIES - 1) throw error;
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    return retryAttempt(request, attempt + 1);
  }
}

function sortedWallets(address: Address, transfers: Transfer[]): WalletInfo[] {
  const addresses = new Set<Address>([address]);
  for (const transfer of transfers) {
    addresses.add(transfer.from);
    addresses.add(transfer.to);
  }
  return [...addresses].sort().map((addr) => ({ addr, kind: "", label: "", category: null }));
}

function mapTransferLogs(
  address: Address,
  outgoingLogs: TransferLog[],
  incomingLogs: TransferLog[],
  authorizationLogs: AuthorizationLog[],
  timestamps: Map<bigint, number>,
): Transfer[] {
  const authorizedTransactions = new Set(authorizationLogs.map((log) => log.transactionHash));
  const outgoing = outgoingLogs.filter((log) => authorizedTransactions.has(log.transactionHash));
  // These outgoing EIP-3009 payments are x402-style; EIP-3009 alone does not prove x402 use.
  const selected = [...outgoing, ...incomingLogs];
  const unique = new Map<string, Transfer>();
  for (const log of selected) {
    if (!log.transactionHash || log.blockNumber === null) continue;
    const { from, to, value } = log.args;
    if (!from || !to || value === undefined) continue;
    const tx = log.transactionHash.toLowerCase();
    unique.set(`${tx}:${log.logIndex}`, {
      tx,
      from: from.toLowerCase() as Address,
      to: to.toLowerCase() as Address,
      amount: Number(value) / 1_000_000,
      ts: timestamps.get(log.blockNumber) ?? 0,
    });
  }
  return [...unique.values()].filter((transfer) => transfer.from === address || transfer.to === address)
    .sort((a, b) => a.ts - b.ts || a.tx.localeCompare(b.tx));
}

export function ledgerFromLogs(
  address: Address,
  fromBlock: bigint,
  toBlock: bigint,
  outgoingLogs: TransferLog[],
  incomingLogs: TransferLog[],
  authorizationLogs: AuthorizationLog[],
  timestamps: Map<bigint, number>,
): Ledger {
  const normalizedAddress = address.toLowerCase() as Address;
  const transfers = mapTransferLogs(normalizedAddress, outgoingLogs, incomingLogs, authorizationLogs, timestamps);
  const startTs = timestamps.get(fromBlock) ?? 0;
  const endTs = timestamps.get(toBlock) ?? startTs;
  return {
    seed: 0,
    start_ts: startTs,
    days: Math.max(0, (endTs - startTs) / 86_400),
    wallets: sortedWallets(address, transfers),
    transfers,
  };
}

export async function fetchAgentTransfers(address: Address, opts: { fromBlock: bigint; toBlock: bigint }): Promise<Ledger> {
  if (opts.fromBlock < 0n || opts.toBlock < opts.fromBlock) throw new Error("Invalid Base block range");
  const normalizedAddress = address.toLowerCase() as Address;
  const rpcUrl = process.env.BASE_RPC_URL || "https://mainnet.base.org";
  // Alchemy's free plan limits eth_getLogs to 10 blocks; its transfer API has no range limit.
  if (new URL(rpcUrl).hostname.endsWith(".alchemy.com")) {
    return fetchAlchemyLedger(normalizedAddress, opts, async (body) => {
      const res = await fetch(rpcUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
      // a rate limit can arrive as a bare HTTP 429 with an empty body; the ingest retries it
      if (res.status === 429) return { error: { code: 429, message: "HTTP 429 (compute units per second)" } };
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Alchemy HTTP ${res.status}: ${text.slice(0, 120) || "empty response"}`);
      }
    });
  }
  const client = createPublicClient({ chain: base, transport: http(rpcUrl, { retryCount: 2 }) });
  const outgoing: TransferLog[] = [];
  const incoming: TransferLog[] = [];
  const authorizations: AuthorizationLog[] = [];
  const blocks = new Set<bigint>([opts.fromBlock, opts.toBlock]);

  for (let start = opts.fromBlock; start <= opts.toBlock; start += PAGE_SIZE) {
    const end = start + PAGE_SIZE - 1n < opts.toBlock ? start + PAGE_SIZE - 1n : opts.toBlock;
    const [outLogs, inLogs, authLogs] = await Promise.all([
      retry(() => client.getLogs({ address: BASE_USDC, event: TRANSFER, args: { from: normalizedAddress }, fromBlock: start, toBlock: end, strict: true })),
      retry(() => client.getLogs({ address: BASE_USDC, event: TRANSFER, args: { to: normalizedAddress }, fromBlock: start, toBlock: end, strict: true })),
      retry(() => client.getLogs({ address: BASE_USDC, event: AUTHORIZATION_USED, args: { authorizer: normalizedAddress }, fromBlock: start, toBlock: end, strict: true })),
    ]);
    outgoing.push(...outLogs as TransferLog[]);
    incoming.push(...inLogs as TransferLog[]);
    authorizations.push(...authLogs as AuthorizationLog[]);
    for (const log of [...outLogs, ...inLogs]) if (log.blockNumber !== null) blocks.add(log.blockNumber);
  }

  const timestamps = new Map<bigint, number>();
  const blockNumbers = [...blocks];
  for (let offset = 0; offset < blockNumbers.length; offset += 5) {
    await Promise.all(blockNumbers.slice(offset, offset + 5).map(async (blockNumber) => {
      const block = await retry(() => client.getBlock({ blockNumber }));
      timestamps.set(blockNumber, Number(block.timestamp));
    }));
  }
  return ledgerFromLogs(address, opts.fromBlock, opts.toBlock, outgoing, incoming, authorizations, timestamps);
}
