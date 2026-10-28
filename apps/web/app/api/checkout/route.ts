// POST /api/checkout { plan: "pro-audit" } → { url } (Dodo Payments checkout; CONTRACTS.md §4)
// Dodo API: POST {base}/checkouts, bearer key, body { product_cart, return_url } → { checkout_url, session_id }
// https://docs.dodopayments.com/api-reference/checkout-sessions/create
import "../_lib/env";
import { errorResponse, HttpError } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = { test: "https://test.dodopayments.com", live: "https://live.dodopayments.com" } as const;

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json().catch(() => ({}))) as { plan?: unknown };
    if (body.plan !== "pro-audit") throw new HttpError(400, 'plan must be "pro-audit"');
    const key = process.env.DODO_API_KEY, product = process.env.DODO_PRODUCT_ID;
    if (!key || !product) throw new HttpError(503, "checkout is not configured yet");
    const mode = process.env.DODO_MODE === "live" ? "live" : "test";
    const res = await fetch(`${BASE[mode]}/checkouts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ product_cart: [{ product_id: product, quantity: 1 }], return_url: `${new URL(req.url).origin}/audit?paid=1` }),
      signal: AbortSignal.timeout(15_000),
    });
    const out = (await res.json().catch(() => ({}))) as { checkout_url?: string; message?: string };
    if (!res.ok || !out.checkout_url) throw new HttpError(502, `Dodo checkout failed: ${out.message ?? res.status}`);
    return Response.json({ url: out.checkout_url });
  } catch (err) {
    return errorResponse(err);
  }
}
