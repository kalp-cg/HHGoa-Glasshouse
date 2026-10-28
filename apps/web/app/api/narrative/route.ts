// POST /api/narrative  body: ProfileFacts → { text } (CONTRACTS.md §4)
import "../_lib/env";
import { validateProfileFacts, type ProfileFacts } from "@glasshouse/engine";
import { errorResponse, HttpError } from "../_lib/http";
import { narrative } from "../_lib/narrative";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const body: unknown = await req.json().catch(() => {
      throw new HttpError(400, "body must be JSON");
    });
    const problems = validateProfileFacts(body);
    if (problems.length) throw new HttpError(400, `body must be ProfileFacts: ${problems.slice(0, 3).join("; ")}`);
    const { text, source } = await narrative(body as ProfileFacts);
    return Response.json({ text }, { headers: { "x-glasshouse-narrative": source } });
  } catch (err) {
    return errorResponse(err);
  }
}
