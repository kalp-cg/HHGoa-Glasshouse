// POST /api/shield/session { owner_hint? } → { wallet, funded_tx, payment_tx? } (CONTRACTS.md §4 + approved payment_tx)
// A fresh one-time wallet per session, funded by Codex's relayer through the rail (Base Sepolia, testnet only).
// If X402_TEST_URL is set, it pays that endpoint once from the new wallet. The key never leaves this request.
import "../../_lib/env";
import { newOneTimeWallet, payX402 } from "@glasshouse/chain";
import { errorResponse, HttpError } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function receipt(tx: string): Promise<boolean> {
  const rpc = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
  for (let i = 0; i < 15; i++) {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [tx] }),
    });
    const body = (await res.json()) as { result?: { status?: string } | null };
    if (body.result) return body.result.status === "0x1";
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const relayer = process.env.RELAYER_URL;
    if (!relayer) throw new HttpError(503, "Shield sessions are not configured yet (RELAYER_URL)");
    const wallet = newOneTimeWallet();
    const res = await fetch(`${relayer.replace(/\/+$/, "")}/release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: wallet.address }),
      signal: AbortSignal.timeout(30_000),
    });
    const out = (await res.json().catch(() => ({}))) as { tx?: string; error?: string };
    if (!res.ok || !out.tx) throw new HttpError(502, `relayer: ${out.error ?? res.status}`);

    let payment_tx: string | undefined;
    const testUrl = process.env.X402_TEST_URL;
    if (testUrl && (await receipt(out.tx))) {
      payment_tx = (await payX402(testUrl, { privateKey: wallet.privateKey })).tx || undefined;
    }
    return Response.json({ wallet: wallet.address.toLowerCase(), funded_tx: out.tx, ...(payment_tx ? { payment_tx } : {}) });
  } catch (err) {
    return errorResponse(err);
  }
}
