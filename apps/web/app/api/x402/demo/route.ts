// GET /api/x402/demo: a tiny paid resource on Base Sepolia, so a Shield one-time wallet can make a real x402 payment.
// x402 seller docs (@x402/next 2.28.0): https://github.com/x402-foundation/x402/tree/main/typescript/packages/http/next
// The testnet facilitator settles the payment (EIP-3009), so the paying wallet needs USDC but no ETH.
import "../../_lib/env";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { withX402, x402ResourceServer } from "@x402/next";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NETWORK = "eip155:84532"; // Base Sepolia only: never mainnet
const payTo = process.env.X402_PAY_TO as `0x${string}` | undefined;

const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" }))
  .register(NETWORK, new ExactEvmScheme());

async function handler(_req: NextRequest): Promise<NextResponse> {
  return NextResponse.json({ ok: true, resource: "Glasshouse x402 test resource", served_at: new Date().toISOString() });
}

const notConfigured = async () => NextResponse.json({ error: "x402 demo endpoint is not configured (X402_PAY_TO)" }, { status: 503 });

export const GET = payTo
  ? withX402(handler, { accepts: [{ scheme: "exact", price: "$0.01", network: NETWORK, payTo }], description: "Glasshouse x402 test resource (Base Sepolia)" }, server)
  : notConfigured;
