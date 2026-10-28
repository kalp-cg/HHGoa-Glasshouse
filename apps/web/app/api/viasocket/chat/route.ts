// POST /api/viasocket/chat { chat } → the chat alerts go to (must be one of /api/viasocket/chats)
import "../../_lib/env";
import { setChat } from "../../_lib/alerts";
import { readSession } from "../../_lib/audit";
import { errorResponse } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const { uid } = readSession(req);
    const body = (await req.json().catch(() => ({}))) as { chat?: unknown };
    return Response.json(await setChat(uid, body.chat));
  } catch (err) {
    return errorResponse(err);
  }
}
