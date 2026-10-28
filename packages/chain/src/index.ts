// Stubs for the Codex ↔ Claude interface in CONTRACTS.md §5. Codex owns this package.
import type { Address, Ledger } from "@glasshouse/engine";

const notImplemented = (name: string) => new Error(`${name}: not implemented`);

export function newOneTimeWallet(): { address: Address; privateKey: `0x${string}` } {
  throw notImplemented("newOneTimeWallet");
}

export async function verifyOwnership(_address: Address, _message: string, _signature: `0x${string}`): Promise<boolean> {
  throw notImplemented("verifyOwnership");
}

export async function fetchAgentTransfers(_address: Address, _opts: { fromBlock: bigint; toBlock: bigint }): Promise<Ledger> {
  throw notImplemented("fetchAgentTransfers");
}

export async function payX402(_url: string, _wallet: { privateKey: `0x${string}` }): Promise<{ tx: string; status: number }> {
  throw notImplemented("payX402");
}
