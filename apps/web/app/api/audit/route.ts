// POST /api/audit  { address, signature, nonce } → ProfileFacts (source "base-mainnet"), or 401 (CONTRACTS.md §4)
// The profile is returned only to the wallet's verified owner and is never stored.
import "../_lib/env";
import { fetchAgentTransfers, verifyOwnership } from "@glasshouse/chain";
import { notifyLeak } from "../_lib/alerts";
import { auditProfile, blockRange, consumeChallenge, parseAddress, recordAudit, sessionCookie, signSession, userIdFor } from "../_lib/audit";
import { errorResponse, HttpError } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json().catch(() => ({}))) as { address?: unknown; signature?: unknown; nonce?: unknown };
    const address = parseAddress(body.address);
    const message = await consumeChallenge(address, body.nonce);
    const signature = body.signature;
    if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature)) throw new HttpError(400, "signature missing or malformed");
    if (!(await verifyOwnership(address, message, signature as `0x${string}`))) {
      throw new HttpError(401, "That signature isn't from this wallet, so we can't show its audit: you can only audit a wallet you own.");
    }

    const ledger = await fetchAgentTransfers(address, await blockRange());
    const facts = auditProfile(ledger, address);
    await recordAudit(address, facts);
    const alert = await notifyLeak(userIdFor(address), facts, new URL(req.url).origin);

    const headers = new Headers({ "x-glasshouse-alert": alert });
    if (process.env.SESSION_SECRET) headers.append("set-cookie", sessionCookie(signSession(address)));
    return Response.json(facts, { headers });
  } catch (err) {
    return errorResponse(err);
  }
}
