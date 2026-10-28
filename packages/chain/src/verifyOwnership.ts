import type { Address } from "@glasshouse/engine";
import { verifyMessage } from "viem";

// viem 2.57.2 EIP-191 API: https://viem.sh/docs/actions/public/verifyMessage
export async function verifyOwnership(address: Address, message: string, signature: `0x${string}`): Promise<boolean> {
  try {
    return await verifyMessage({ address, message, signature });
  } catch {
    return false;
  }
}
