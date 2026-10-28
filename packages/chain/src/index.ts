import type { Address, Ledger } from "@glasshouse/engine";
import { newOneTimeWallet } from "./oneTimeWallet";
import { verifyOwnership } from "./verifyOwnership";

export { newOneTimeWallet, verifyOwnership };

export async function fetchAgentTransfers(_address: Address, _opts: { fromBlock: bigint; toBlock: bigint }): Promise<Ledger> {
  throw new Error("fetchAgentTransfers: not implemented");
}

export async function payX402(_url: string, _wallet: { privateKey: `0x${string}` }): Promise<{ tx: string; status: number }> {
  throw new Error("payX402: not implemented");
}
