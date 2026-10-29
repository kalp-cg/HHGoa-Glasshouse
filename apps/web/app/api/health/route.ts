// GET /api/health → is every dependency up? For demo day. Never returns a secret or an address.
import "../_lib/env";
import { configFromEnv, createClient } from "@glasshouse/tigergraph";
import { store } from "../_lib/store";
import demo from "../../../../../fixtures/profile.open.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Check = { ok: boolean; note?: string };
const USDC_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

async function timed(fn: () => Promise<string | undefined>): Promise<Check> {
  try {
    const note = await Promise.race([fn(), new Promise<never>((_, no) => setTimeout(() => no(new Error("timed out")), 8000))]);
    return { ok: true, ...(note ? { note } : {}) };
  } catch (err) {
    return { ok: false, note: err instanceof Error ? err.message.slice(0, 120) : "failed" };
  }
}

async function rpc(url: string, method: string, params: unknown[]): Promise<string> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const body = (await res.json()) as { result?: string; error?: { message: string } };
  if (!body.result) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  return body.result;
}

export async function GET(): Promise<Response> {
  const tg = configFromEnv();
  const rail = process.env.RAIL_ADDRESS?.trim();
  const checks: Record<string, Check> = {
    store: await timed(async () => { await store().get("health:ping"); return process.env.UPSTASH_REDIS_REST_URL ? "upstash" : "local file"; }),
    tigergraph: process.env.OFFLINE_MODE === "true" ? { ok: true, note: "offline mode: engine answers" }
      : !tg ? { ok: false, note: "not configured: engine answers" }
      : await timed(async () => { await createClient({ ...tg, timeoutMs: 7000, retries: 1 }).runQuery("owner_profile", { seed: `open:${demo.seed_wallet}` }); return "queries answer"; }),
    base_mainnet: await timed(async () => `block ${Number(BigInt(await rpc(process.env.BASE_RPC_URL || "https://mainnet.base.org", "eth_blockNumber", [])))}`),
    shield_rail: !rail ? { ok: false, note: "RAIL_ADDRESS not set" } : await timed(async () => {
      const bal = BigInt(await rpc(process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org", "eth_call", [{ to: USDC_SEPOLIA, data: `0x70a08231${rail.slice(2).toLowerCase().padStart(64, "0")}` }, "latest"]));
      if (bal < 1_000_000n) throw new Error(`holds ${Number(bal) / 1e6} USDC: needs a top-up for live sessions`);
      return `holds ${Number(bal) / 1e6} USDC (${Number(bal / 1_000_000n)} sessions)`;
    }),
    ai_write_up: { ok: true, note: process.env.GROQ_API_KEY ? "Groq" : "template only" },
    checkout: { ok: Boolean(process.env.DODO_API_KEY && process.env.DODO_PRODUCT_ID), note: process.env.DODO_PRODUCT_ID ? "Dodo test mode" : "not configured" },
    alerts: { ok: Boolean(process.env.VIASOCKET_EMBED_SECRET), note: process.env.VIASOCKET_EMBED_SECRET ? "viaSocket" : "not configured" },
  };
  const ok = checks.store!.ok && checks.base_mainnet!.ok; // what the site needs to serve; the rest degrade gracefully
  return Response.json({ ok, checks, at: new Date().toISOString() }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
