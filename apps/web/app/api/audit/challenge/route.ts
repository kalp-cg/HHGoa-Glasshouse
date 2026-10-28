// POST /api/audit/challenge  { address } → { message, nonce, expires_at } (CONTRACTS.md §4)
import "../../_lib/env";
import { createChallenge, parseAddress } from "../../_lib/audit";
import { errorResponse } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json().catch(() => ({}))) as { address?: unknown };
    return Response.json(await createChallenge(parseAddress(body.address)));
  } catch (err) {
    return errorResponse(err);
  }
}
