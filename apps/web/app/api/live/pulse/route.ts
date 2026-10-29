// GET /api/live/pulse → x402-style payments on Base in the last ~20 s (totals only, cached 20 s)
import "../../_lib/env";
import { errorResponse } from "../../_lib/http";
import { pulse } from "../../_lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return Response.json(await pulse(), { headers: { "cache-control": "public, s-maxage=20, stale-while-revalidate=40" } });
  } catch (err) {
    return errorResponse(err);
  }
}
