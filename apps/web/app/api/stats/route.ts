// GET /api/stats → { audits, leaking_timezone } (totals only; CONTRACTS.md §4)
import "../_lib/env";
import { stats } from "../_lib/audit";
import { errorResponse } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return Response.json(await stats());
  } catch (err) {
    return errorResponse(err);
  }
}
