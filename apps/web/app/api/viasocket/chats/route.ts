// GET /api/viasocket/chats → [{ value, label }]: chats that recently messaged the user's bot
import "../../_lib/env";
import { listChats } from "../../_lib/alerts";
import { readSession } from "../../_lib/audit";
import { errorResponse } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  try {
    return Response.json(await listChats(readSession(req).uid));
  } catch (err) {
    return errorResponse(err);
  }
}
