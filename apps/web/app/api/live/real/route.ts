// GET  /api/live/real → running totals of real agent wallets sampled live (no addresses)
// POST /api/live/real → take one more live sample if none ran in the last 2 minutes, then return the totals
import "../../_lib/env";
import { errorResponse } from "../../_lib/http";
import { liveTotals, sampleLive } from "../../_lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(): Promise<Response> {
  try {
    return Response.json(await liveTotals());
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(): Promise<Response> {
  try {
    const added = await sampleLive().catch((err: unknown) => {
      console.warn(`live sample skipped: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    });
    return Response.json(await liveTotals(), { headers: { "x-glasshouse-sampled": String(added) } });
  } catch (err) {
    return errorResponse(err);
  }
}
