// GET /api/stats → { audits, leaking_timezone } (totals only; CONTRACTS.md §4)
import "../_lib/env";
import { stats } from "../_lib/audit";
import { errorResponse, HttpError } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return Response.json(await stats());
  } catch (err) {
    // no shared store yet (fresh deploy): show an empty counter rather than an error on the page
    if (err instanceof HttpError && err.status === 503) return Response.json({ audits: 0, leaking_timezone: 0 }, { headers: { "x-glasshouse-store": "missing" } });
    return errorResponse(err);
  }
}
