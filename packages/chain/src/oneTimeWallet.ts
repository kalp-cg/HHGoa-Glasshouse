import type { Address } from "@glasshouse/engine";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// viem 2.57.2 account API: https://viem.sh/docs/accounts/local/privateKeyToAccount
export function newOneTimeWallet(): { address: Address; privateKey: `0x${string}` } {
  const privateKey = generatePrivateKey();
  const { address } = privateKeyToAccount(privateKey);
  return { address, privateKey };
}
