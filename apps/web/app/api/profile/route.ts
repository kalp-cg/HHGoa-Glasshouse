// GET /api/profile?wallet=0x..&mode=open|shield → ProfileFacts (CONTRACTS.md §4)
import "../_lib/env";
import { errorResponse, walletAndMode } from "../_lib/http";
import { profileFor } from "../_lib/world";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<Response> {
  try {
    const { wallet, mode } = walletAndMode(req);
    const { facts, source } = await profileFor(wallet, mode);
    return Response.json(facts, { headers: { "x-glasshouse-links": source } });
  } catch (err) {
    return errorResponse(err);
  }
}
