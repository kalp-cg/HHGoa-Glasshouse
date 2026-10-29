// POST /api/shield/session { owner_hint? } → { wallet, funded_tx, payment_tx? } (CONTRACTS.md §4 + §7)
// A fresh one-time wallet per session, funded through the Rail on Base Sepolia (testnet only), then one x402 payment
// from it. Funding goes through Codex's relayer at RELAYER_URL when set; otherwise this route releases from the Rail
// itself with the testnet relayer key (the deployed site cannot reach a relayer on a laptop). The one-time key never
// leaves this request.
import "../../_lib/env";
import { newOneTimeWallet, payX402 } from "@glasshouse/chain";
import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { errorResponse, HttpError } from "../../_lib/http";
import { store } from "../../_lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Circle USDC on Base Sepolia
const RAIL_ABI = parseAbi(["function release(address to)"]);
const ERC20_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const RELEASE = 1_000_000n; // Rail.RELEASE_AMOUNT, 1 USDC

// The live site can be clicked by anyone: cap sessions so nobody can drain the Rail.
async function rateLimit(): Promise<void> {
  const cap = Number(process.env.SHIELD_SESSIONS_PER_HOUR ?? 10);
  const n = await store().incr(`shield:hour:${Math.floor(Date.now() / 3_600_000)}`);
  if (n > cap) throw new HttpError(429, `Shield demo limit reached (${cap} sessions an hour); try again later`);
}

async function viaRelayer(relayerUrl: string, to: string): Promise<string> {
  const res = await fetch(`${relayerUrl.replace(/\/+$/, "")}/release`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to }),
    signal: AbortSignal.timeout(30_000),
  });
  const out = (await res.json().catch(() => ({}))) as { tx?: string; error?: string };
  if (!res.ok || !out.tx) throw new HttpError(502, `relayer: ${out.error ?? res.status}`);
  return out.tx;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const relayerUrl = process.env.RELAYER_URL;
    const relayerKey = process.env.RELAYER_PRIVATE_KEY?.trim();
    const rail = process.env.RAIL_ADDRESS?.trim() as `0x${string}` | undefined;
    if (!relayerUrl && !(relayerKey && rail)) {
      throw new HttpError(503, "Shield sessions are not configured yet (RELAYER_URL, or RELAYER_PRIVATE_KEY + RAIL_ADDRESS)");
    }

    const transport = http(process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");
    const chain = createPublicClient({ chain: baseSepolia, transport });
    if (rail) {
      const balance = await chain.readContract({ address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [rail] });
      if (balance < RELEASE) throw new HttpError(503, "the Rail is empty right now; it needs a USDC deposit before it can fund a session");
    }
    await rateLimit();

    const wallet = newOneTimeWallet();
    let funded_tx: string;
    if (relayerUrl) {
      funded_tx = await viaRelayer(relayerUrl, wallet.address);
    } else {
      const relayer = createWalletClient({ account: privateKeyToAccount(relayerKey as Hex), chain: baseSepolia, transport });
      funded_tx = await relayer.writeContract({ address: rail!, abi: RAIL_ABI, functionName: "release", args: [wallet.address] });
    }

    // Pay once from the new wallet after its funding is mined.
    let payment_tx: string | undefined;
    const receipt = await chain.waitForTransactionReceipt({ hash: funded_tx as Hex, timeout: 30_000 });
    const testUrl = process.env.X402_TEST_URL || `${new URL(req.url).origin}/api/x402/demo`;
    if (receipt.status === "success") {
      payment_tx = (await payX402(testUrl, { privateKey: wallet.privateKey })).tx || undefined;
    }
    return Response.json({ wallet: wallet.address.toLowerCase(), funded_tx, ...(payment_tx ? { payment_tx } : {}) });
  } catch (err) {
    return errorResponse(err);
  }
}
