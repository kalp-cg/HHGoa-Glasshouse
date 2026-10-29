// Minimal TigerGraph 4.x REST client (works with Savanna on https/443).
// Docs read 28 Oct 2026:
//   GSQL endpoints (POST /gsql/v1/tokens, POST /gsql/v1/statements):
//     https://www.tigergraph.com/docs/tigergraph-server/4.2/api/gsql-endpoints
//   Upsert (POST /restpp/graph/{graph}): https://www.tigergraph.com/docs/tigergraph-server/4.3/api/upsert-rest
//   Savanna REST++ on 443 under /restpp with "Authorization: Bearer <token>":
//     https://www.tigergraph.com/docs/savanna/main/resources/faqs
export interface TgConfig {
  host: string;      // e.g. https://<workspace>.i.tgcloud.io
  token: string;
  graph: string;
  secret?: string;       // optional: lets the client renew an expired token itself (POST /gsql/v1/tokens)
  timeoutMs?: number;
  retries?: number;      // total attempts on network failure (default 3)
  retryDelayMs?: number; // grows linearly per attempt (default 1000)
}

export class TgError extends Error {}

const RETRY_STATUS = new Set([429, 499, 502, 503, 504]);

export type QueryParams = Record<string, string | number>;

export interface TgClient {
  graph: string;
  statements(gsql: string): Promise<string>;
  upsert(payload: unknown): Promise<unknown>;
  runQuery(name: string, params: QueryParams): Promise<unknown[]>;
}

export function configFromEnv(env: Record<string, string | undefined> = process.env): TgConfig | null {
  const host = env.TG_HOST?.trim();
  const token = env.TG_TOKEN?.trim();
  const secret = env.TG_SECRET?.trim() || undefined;
  if (!host || (!token && !secret)) return null;
  return {
    host: (/^https?:\/\//.test(host) ? host : `https://${host}`).replace(/\/+$/, ""),
    token: token ?? "",
    graph: env.TG_GRAPH?.trim() || "Glasshouse",
    ...(secret ? { secret } : {}),
  };
}

// Tokens renewed from the secret, per host, shared by every client in this process (tokens last a week).
const renewed = new Map<string, string>();

export function createClient(cfg: TgConfig, fetchImpl: typeof fetch = fetch): TgClient {
  const token = () => renewed.get(cfg.host) ?? cfg.token;
  const renew = async (): Promise<boolean> => {
    if (!cfg.secret) return false;
    const res = await fetchImpl(`${cfg.host}/gsql/v1/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: cfg.secret }),
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 30_000),
    });
    const body = (await res.json().catch(() => ({}))) as { token?: string };
    if (!res.ok || !body.token) return false;
    renewed.set(cfg.host, body.token);
    return true;
  };
  // Network failures (fetch throws TypeError) are always retried. Gateway timeouts and overload
  // (429/499/502/503/504) are retried only for idempotent calls (upserts, query reads).
  const send = async (path: string, init: RequestInit, idempotent: boolean): Promise<Response> => {
    const attempts = cfg.retries ?? 3;
    for (let i = 1; ; i++) {
      const wait = () => new Promise((r) => setTimeout(r, (cfg.retryDelayMs ?? 1000) * i));
      try {
        const res = await fetchImpl(`${cfg.host}${path}`, {
          ...init,
          headers: { Authorization: `Bearer ${token()}`, ...init.headers },
          signal: AbortSignal.timeout(cfg.timeoutMs ?? 30_000),
        });
        if (!idempotent || !RETRY_STATUS.has(res.status) || i >= attempts) return res;
        await res.body?.cancel();
      } catch (err) {
        if (!(err instanceof TypeError) || i >= attempts) throw err;
      }
      await wait();
    }
  };
  const request = async (path: string, init: RequestInit, idempotent = false): Promise<string> => {
    let res = await send(path, init, idempotent);
    // an expired or missing token: renew it from the secret once, then retry
    if ((res.status === 401 || res.status === 403 || !token()) && (await renew())) res = await send(path, init, idempotent);
    const text = await res.text();
    if (!res.ok) throw new TgError(`TigerGraph ${res.status} on ${path}: ${text.slice(0, 300)}`);
    return text;
  };
  const json = (text: string, path: string): Record<string, unknown> => {
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new TgError(`TigerGraph returned non-JSON on ${path}: ${text.slice(0, 300)}`);
    }
    const obj = body as Record<string, unknown>;
    if (obj.error === true) throw new TgError(`TigerGraph error on ${path}: ${String(obj.message)}`);
    return obj;
  };

  return {
    graph: cfg.graph,
    statements: (gsql) =>
      request("/gsql/v1/statements", { method: "POST", headers: { "Content-Type": "text/plain" }, body: gsql }),
    upsert: async (payload) => {
      const path = `/restpp/graph/${cfg.graph}`;
      return json(await request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, true), path);
    },
    runQuery: async (name, params) => {
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]): [string, string] => [k, String(v)]));
      const path = `/restpp/query/${cfg.graph}/${name}?${qs}`;
      const body = json(await request(path, { method: "GET" }, true), path);
      if (!Array.isArray(body.results)) throw new TgError(`TigerGraph query ${name} returned no results array`);
      return body.results;
    },
  };
}
