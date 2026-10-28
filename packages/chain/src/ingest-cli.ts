import { fetchAgentTransfers } from "./ingestBase";
import type { Address } from "@glasshouse/engine";

const [address, fromBlockArg, toBlockArg] = process.argv.slice(2);
if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address) || !fromBlockArg || !toBlockArg) {
  throw new Error("Usage: pnpm --filter @glasshouse/chain ingest -- <address> <fromBlock> <toBlock>");
}

const ledger = await fetchAgentTransfers(address.toLowerCase() as Address, {
  fromBlock: BigInt(fromBlockArg),
  toBlock: BigInt(toBlockArg),
});
const outgoing = ledger.transfers.filter((transfer) => transfer.from === address.toLowerCase());
const incoming = ledger.transfers.filter((transfer) => transfer.to === address.toLowerCase());
console.log(JSON.stringify({
  wallet: address.toLowerCase(),
  blocks: { from: fromBlockArg, to: toBlockArg },
  x402_style_payments: outgoing.length,
  outgoing_usdc: Number(outgoing.reduce((sum, transfer) => sum + transfer.amount, 0).toFixed(6)),
  incoming_transfers: incoming.length,
  incoming_usdc: Number(incoming.reduce((sum, transfer) => sum + transfer.amount, 0).toFixed(6)),
  wallets: ledger.wallets.length,
}, null, 2));
