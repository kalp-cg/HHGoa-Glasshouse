import type { Address, Ledger } from "@glasshouse/engine";
import { describe, expect, it, vi } from "vitest";
import { configFromEnv, createClient, TgError } from "../src/client";
import { normalizeLinks, tgLinks, tgMembers } from "../src/links";

const A = "0x00000000000000000000000000000000000000aa" as Address;
const B = "0x00000000000000000000000000000000000000bb" as Address;

function fakeFetch(responses: Record<string, { status?: number; body: unknown }>) {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    const hit = Object.entries(responses).find(([k]) => u.includes(k));
    if (!hit) throw new Error(`unexpected ${u}`);
    const { status = 200, body } = hit[1];
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  });
}

describe("configFromEnv", () => {
  it("needs host and token; adds https and strips slashes; defaults the graph", () => {
    expect(configFromEnv({ TG_HOST: "x.i.tgcloud.io/", TG_TOKEN: "t" })).toEqual({ host: "https://x.i.tgcloud.io", token: "t", graph: "Glasshouse" });
    expect(configFromEnv({ TG_HOST: "http://localhost:14240", TG_TOKEN: "t", TG_GRAPH: "G" })?.host).toBe("http://localhost:14240");
    expect(configFromEnv({ TG_HOST: "x" })).toBeNull();
    expect(configFromEnv({})).toBeNull();
  });
});

describe("createClient", () => {
  const cfg = { host: "https://tg.example", token: "tok", graph: "G" };

  it("sends the bearer token and hits the documented paths", async () => {
    const f = fakeFetch({ "/restpp/query/G/q": { body: { error: false, results: [{ x: 1 }] } }, "/restpp/graph/G": { body: { accepted_vertices: 1 } }, "/gsql/v1/statements": { body: "ok" } });
    const c = createClient(cfg, f);
    expect(await c.runQuery("q", { mode: "open", span: 5 })).toEqual([{ x: 1 }]);
    await c.upsert({ vertices: {} });
    expect(await c.statements("ls")).toBe("ok");
    const [url, init] = f.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("https://tg.example/restpp/query/G/q?mode=open&span=5");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("retries network failures, then gives up; never retries HTTP errors", async () => {
    let calls = 0;
    const flaky = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new TypeError("fetch failed");
      return new Response(JSON.stringify({ results: [] }));
    });
    expect(await createClient({ ...cfg, retryDelayMs: 1 }, flaky).runQuery("q", {})).toEqual([]);
    expect(calls).toBe(3);

    const down = vi.fn(async () => { throw new TypeError("fetch failed"); });
    await expect(createClient({ ...cfg, retryDelayMs: 1, retries: 2 }, down).runQuery("q", {})).rejects.toThrow("fetch failed");
    expect(down).toHaveBeenCalledTimes(2);

    const http = fakeFetch({ "/restpp": { status: 500, body: "boom" } });
    await expect(createClient({ ...cfg, retryDelayMs: 1 }, http).runQuery("q", {})).rejects.toThrow(TgError);
    expect(http).toHaveBeenCalledTimes(1);
  });

  it("retries 499/5xx gateway errors for upserts and reads, but not for GSQL statements", async () => {
    const gateway = () => fakeFetch({ "/": { status: 499, body: "Client Closed Request" } });
    const up = gateway();
    await expect(createClient({ ...cfg, retryDelayMs: 1 }, up).upsert({})).rejects.toThrow("499");
    expect(up).toHaveBeenCalledTimes(3);
    const st = gateway();
    await expect(createClient({ ...cfg, retryDelayMs: 1 }, st).statements("ls")).rejects.toThrow("499");
    expect(st).toHaveBeenCalledTimes(1);
  });

  it("throws TgError on HTTP errors and on error: true", async () => {
    await expect(createClient(cfg, fakeFetch({ "/restpp": { status: 401, body: "nope" } })).runQuery("q", {})).rejects.toThrow(TgError);
    await expect(createClient(cfg, fakeFetch({ "/restpp": { body: { error: true, message: "bad" } } })).runQuery("q", {})).rejects.toThrow("bad");
  });
});

describe("tgLinks / tgMembers", () => {
  const ledger: Ledger = { seed: 0, start_ts: 0, days: 10, wallets: [], transfers: [] };

  it("maps GSQL rows to SameOwnerLink with the engine's detail text", async () => {
    const f = fakeFetch({
      link_funding: { body: { results: [{ links: [{ a: A, b: B, n: 1, micro: 25_000_000 }] }] } },
      link_coactivity: { body: { results: [{ links: [{ a: A, b: B, days: 4 }] }] } },
    });
    const links = await tgLinks(createClient({ host: "h", token: "t", graph: "G" }, f), ledger, "open");
    expect(normalizeLinks(links)).toEqual([
      `co-activity|${A}|${B}|same 2 minutes on 4 days`,
      `funding|${A}|${B}|topped up 25 USDC`,
    ]);
    expect(String(f.mock.calls.find(([u]) => String(u).includes("link_coactivity"))![0])).toContain("span=864000");
  });

  it("owner_profile seeds with the mode-prefixed id", async () => {
    const f = fakeFetch({ owner_profile: { body: { results: [{ members: [A, B] }] } } });
    expect(await tgMembers(createClient({ host: "h", token: "t", graph: "G" }, f), "shield", A)).toEqual([A, B]);
    expect(String(f.mock.calls[0]![0])).toContain(`seed=shield%3A${A}`);
  });

  it("rejects malformed results", async () => {
    const f = fakeFetch({ link_: { body: { results: [{}] } } });
    await expect(tgLinks(createClient({ host: "h", token: "t", graph: "G" }, f), ledger, "open")).rejects.toThrow(TgError);
  });
});
