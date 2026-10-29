// Phase 4 routes, offline. The Base ingest is replaced by a realistic real-chain ledger (one agent wallet's
// own USDC history, every counterparty unlabelled, as packages/chain returns it); signatures are real.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simulate, validateProfileFacts, type Address, type Ledger, type ProfileFacts } from "@glasshouse/engine";
import { privateKeyToAccount } from "viem/accounts";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sim = simulate(42, "open");
const travelAgent = sim.you.agents[2]!;
const owner = privateKeyToAccount(`0x${"42".repeat(32)}`);
const stranger = privateKeyToAccount(`0x${"77".repeat(32)}`);
const ownerAddr = owner.address.toLowerCase() as Address;

// the travel agent's history, re-addressed to a wallet whose key we hold
function realChainLedger(): Ledger {
  const swap = (a: Address) => (a === travelAgent ? ownerAddr : a);
  const transfers = sim.ledger.transfers.filter((t) => t.from === travelAgent || t.to === travelAgent)
    .map((t) => ({ ...t, from: swap(t.from), to: swap(t.to) }));
  const addrs = [...new Set(transfers.flatMap((t) => [t.from, t.to]))].sort();
  return { seed: 0, start_ts: sim.ledger.start_ts, days: 10, wallets: addrs.map((addr) => ({ addr, kind: "", label: "", category: null })), transfers };
}

vi.mock("@glasshouse/chain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@glasshouse/chain")>()),
  fetchAgentTransfers: vi.fn(async () => realChainLedger()),
}));

type Handler = (r: Request) => Promise<Response>;
let challenge: Handler, audit: Handler, stats: () => Promise<Response>, checkout: Handler, shield: Handler;
let chats: Handler, connected: Handler;

beforeAll(async () => {
  process.env.GLASSHOUSE_STORE_FILE = join(mkdtempSync(join(tmpdir(), "gh-store-")), "store.json");
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-123";
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.KV_REST_API_URL;
  delete process.env.DODO_API_KEY;
  delete process.env.RELAYER_URL;
  // the only network call left: eth_blockNumber for the audit window
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ jsonrpc: "2.0", id: 1, result: "0x1000000" })));
  ({ POST: challenge } = await import("../audit/challenge/route"));
  ({ POST: audit } = await import("../audit/route"));
  ({ GET: stats } = await import("../stats/route"));
  ({ POST: checkout } = await import("../checkout/route"));
  ({ POST: shield } = await import("../shield/session/route"));
  ({ GET: chats } = await import("../viasocket/chats/route"));
  ({ GET: connected } = await import("../viasocket/connected/route"));
});

const post = (fn: Handler, body: unknown, headers: Record<string, string> = {}) =>
  fn(new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body), headers }));

async function signedAudit(signer = owner, address: string = ownerAddr) {
  const c = await (await post(challenge, { address })).json() as { message: string; nonce: string; expires_at: number };
  const signature = await signer.signMessage({ message: c.message });
  return { c, signature, res: await post(audit, { address, signature, nonce: c.nonce }) };
}

describe("audit", () => {
  it("challenge: message names the wallet and nonce, expires in 5 minutes; bad address → 400", async () => {
    const res = await post(challenge, { address: owner.address });
    const c = await res.json() as { message: string; nonce: string; expires_at: number };
    expect(c.message).toContain(ownerAddr);
    expect(c.message).toContain(c.nonce);
    expect(c.expires_at - Date.now() / 1000).toBeGreaterThan(290);
    expect((await post(challenge, { address: "0x12" })).status).toBe(400);
  });

  it("owner's signature → their profile from real-chain data, with the same engine", async () => {
    const { res } = await signedAudit();
    expect(res.status).toBe(200);
    const p = await res.json() as ProfileFacts;
    expect(validateProfileFacts(p)).toEqual([]);
    expect(p.source).toBe("base-mainnet");
    expect(p.seed_wallet).toBe(ownerAddr);
    expect(p.linkability).toEqual({ traced: 110, total: 110 });
    expect(p.timezone?.label).toBe("UTC+05:30");
    expect(p.signals).toEqual([]); // real sellers have no known category
    expect(res.headers.get("set-cookie")).toMatch(/^gh_session=.+HttpOnly/);
    expect(res.headers.get("x-glasshouse-alert")).toBe("not-connected");
  });

  it("someone else's signature → 401, and the profile is never returned", async () => {
    const { res } = await signedAudit(stranger);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: expect.stringContaining("you can only audit a wallet you own") });
  });

  it("a nonce works once", async () => {
    const { c, signature, res } = await signedAudit();
    expect(res.status).toBe(200);
    const again = await post(audit, { address: ownerAddr, signature, nonce: c.nonce });
    expect(again.status).toBe(401);
  });

  it("a nonce is bound to its wallet", async () => {
    const c = await (await post(challenge, { address: stranger.address })).json() as { message: string; nonce: string };
    const signature = await owner.signMessage({ message: c.message });
    expect((await post(audit, { address: ownerAddr, signature, nonce: c.nonce })).status).toBe(401);
  });

  it("stats are totals only, deduped per wallet", async () => {
    const s = await (await stats()).json();
    expect(s).toEqual({ audits: 1, leaking_timezone: 1 });
    expect(JSON.stringify(s)).not.toContain(ownerAddr.slice(2, 10));
  });
});

describe("alerts routes need a verified session", () => {
  it("401 without the audit session cookie", async () => {
    expect((await chats(new Request("http://localhost/api/viasocket/chats"))).status).toBe(401);
    expect((await connected(new Request("http://localhost/api/viasocket/connected", { headers: { cookie: "gh_session=forged.token" } }))).status).toBe(401);
  });
});

describe("not configured yet → clear 503, never a crash", () => {
  it("checkout", async () => {
    expect((await post(checkout, { plan: "gold" })).status).toBe(400);
    const res = await post(checkout, { plan: "pro-audit" });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/checkout/);
  });
  it("shield session", async () => {
    const res = await post(shield, {});
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/RELAYER_URL/);
  });
});

describe("stats without a shared store (fresh Vercel deploy)", () => {
  it("answers zeros instead of an error", async () => {
    vi.resetModules();
    const saved = { v: process.env.VERCEL, u: process.env.UPSTASH_REDIS_REST_URL, k: process.env.KV_REST_API_URL };
    process.env.VERCEL = "1";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.KV_REST_API_URL;
    try {
      const { GET } = await import("../stats/route");
      const res = await GET();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ audits: 0, leaking_timezone: 0 });
      const { POST } = await import("../audit/challenge/route");
      const challengeRes = await POST(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ address: "0x1111111111111111111111111111111111111111" }) }));
      expect(challengeRes.status).toBe(503);
    } finally {
      if (saved.v === undefined) delete process.env.VERCEL; else process.env.VERCEL = saved.v;
      if (saved.u) process.env.UPSTASH_REDIS_REST_URL = saved.u;
      if (saved.k) process.env.KV_REST_API_URL = saved.k;
      vi.resetModules();
    }
  });
});
