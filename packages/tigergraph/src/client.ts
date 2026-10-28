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
  timeoutMs?: number;
}

export class TgError extends Error {}

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
  if (!host || !token) return null;
  return {
    host: (/^https?:\/\//.test(host) ? host : `https://${host}`).replace(/\/+$/, ""),
    token,
    graph: env.TG_GRAPH?.trim() || "Glasshouse",
  };
}

export function createClient(cfg: TgConfig, fetchImpl: typeof fetch = fetch): TgClient {
  const request = async (path: string, init: RequestInit): Promise<string> => {
    const res = await fetchImpl(`${cfg.host}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${cfg.token}`, ...init.headers },
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 30_000),
    });
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
      return json(await request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }), path);
    },
    runQuery: async (name, params) => {
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]): [string, string] => [k, String(v)]));
      const path = `/restpp/query/${cfg.graph}/${name}?${qs}`;
      const body = json(await request(path, { method: "GET" }), path);
      if (!Array.isArray(body.results)) throw new TgError(`TigerGraph query ${name} returned no results array`);
      return body.results;
    },
  };
}
