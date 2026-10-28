import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

// Official x402 TypeScript client and Fetch API: https://github.com/x402-foundation/x402/tree/main/typescript
type SettlementResponse = { success?: boolean; transaction?: string };

function readSettlement(response: Response): SettlementResponse {
  const header = response.headers.get("PAYMENT-RESPONSE");
  if (!header) return {};
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as SettlementResponse;
  } catch {
    return {};
  }
}

export async function payX402(
  url: string,
  wallet: { privateKey: `0x${string}` },
): Promise<{ tx: string; status: number }> {
  const account = privateKeyToAccount(wallet.privateKey);
  const client = new x402Client();
  client.register("eip155:84532", new ExactEvmScheme(account));
  const paidFetch = wrapFetchWithPayment(fetch, client);
  const response = await paidFetch(url);
  const settlement = readSettlement(response);
  return { tx: settlement.transaction ?? "", status: response.status };
}
