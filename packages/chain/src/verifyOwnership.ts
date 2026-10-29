import type { Address } from "@glasshouse/engine";
import { createPublicClient, http, verifyMessage, type Hex } from "viem";
import { base } from "viem/chains";

// Who can prove they own a wallet:
// - an ordinary wallet (EOA): its EIP-191 signature is checked locally, no network
//   (viem 2.57.2 utility: https://viem.sh/docs/utilities/verifyMessage);
// - a smart wallet (Coinbase Smart Wallet, Safe, CDP smart accounts): checked on Base through ERC-1271, or ERC-6492
//   for a wallet not deployed yet (viem public action: https://viem.sh/docs/actions/public/verifyMessage).
export interface ChainVerifier {
  verifyMessage(args: { address: Address; message: string; signature: Hex }): Promise<boolean>;
}

const baseVerifier = (): ChainVerifier =>
  createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org") });

export async function verifyOwnership(
  address: Address,
  message: string,
  signature: `0x${string}`,
  opts: { chain?: ChainVerifier } = {},
): Promise<boolean> {
  try {
    if (await verifyMessage({ address, message, signature })) return true;
  } catch {
    // not an ordinary signature (e.g. a long smart-wallet signature): ask the chain below
  }
  try {
    return await (opts.chain ?? baseVerifier()).verifyMessage({ address, message, signature });
  } catch {
    return false;
  }
}
