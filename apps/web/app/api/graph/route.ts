// GET /api/graph?wallet=0x..&mode=open|shield → GraphView (CONTRACTS.md §4)
import "../_lib/env";
import { errorResponse, walletAndMode } from "../_lib/http";
import { graphFor } from "../_lib/world";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<Response> {
  try {
    const { wallet, mode } = walletAndMode(req);
    const { graph, source } = await graphFor(wallet, mode);
    return Response.json(graph, { headers: { "x-glasshouse-links": source } });
  } catch (err) {
    return errorResponse(err);
  }
}
