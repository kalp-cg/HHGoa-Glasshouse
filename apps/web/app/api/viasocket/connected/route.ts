// POST   /api/viasocket/connected { authId } → store the user's Telegram connection (after Connect)
// GET    /api/viasocket/connected → { connected, chat }
// DELETE /api/viasocket/connected → turn alerts off and revoke the connection
import "../../_lib/env";
import { disconnect, saveConnection, status } from "../../_lib/alerts";
import { readSession } from "../../_lib/audit";
import { errorResponse } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  try {
    return Response.json(await status(readSession(req).uid));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const { uid } = readSession(req);
    const body = (await req.json().catch(() => ({}))) as { authId?: unknown };
    await saveConnection(uid, body.authId);
    return Response.json(await status(uid));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  try {
    const { uid } = readSession(req);
    await disconnect(uid);
    return Response.json(await status(uid));
  } catch (err) {
    return errorResponse(err);
  }
}
