// GET /api/viasocket/token → { token, serviceIds } for the Connect popup (verified wallet session required)
import "../../_lib/env";
import { connectToken } from "../../_lib/alerts";
import { readSession } from "../../_lib/audit";
import { errorResponse } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  try {
    return Response.json(await connectToken(readSession(req).uid));
  } catch (err) {
    return errorResponse(err);
  }
}
