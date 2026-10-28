// Small key-value store for nonces, usage totals and per-user alert settings.
// Production: Upstash Redis over its REST API (https://upstash.com/docs/redis/features/restapi), configured by
// UPSTASH_REDIS_REST_URL/TOKEN (or Vercel's KV_REST_API_URL/TOKEN). Local runs: a JSON file in apps/web/.data/.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface Store {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  getdel(key: string): Promise<string | null>;  // read once, atomically
  incr(key: string): Promise<number>;
  sadd(key: string, member: string): Promise<boolean>; // true if newly added
}

function upstash(url: string, token: string): Store {
  const cmd = async (...args: (string | number)[]): Promise<unknown> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(5000),
    });
    const body = (await res.json()) as { result?: unknown; error?: string };
    if (!res.ok || body.error) throw new Error(`store: ${body.error ?? res.status}`);
    return body.result;
  };
  return {
    get: async (k) => (await cmd("GET", k)) as string | null,
    set: async (k, v, ttl) => void (await (ttl ? cmd("SET", k, v, "EX", ttl) : cmd("SET", k, v))),
    getdel: async (k) => (await cmd("GETDEL", k)) as string | null,
    incr: async (k) => Number(await cmd("INCR", k)),
    sadd: async (k, m) => Number(await cmd("SADD", k, m)) === 1,
  };
}

type FileData = Record<string, { v: string | string[]; exp?: number }>;

function file(path: string): Store {
  const load = (): FileData => {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as FileData;
    } catch {
      return {};
    }
  };
  const save = (d: FileData) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(d));
  };
  const live = (d: FileData, k: string) => {
    const e = d[k];
    if (e?.exp && e.exp < Date.now()) {
      delete d[k];
      return undefined;
    }
    return e;
  };
  return {
    get: async (k) => {
      const v = live(load(), k)?.v;
      return typeof v === "string" ? v : null;
    },
    set: async (k, v, ttl) => {
      const d = load();
      d[k] = { v, exp: ttl ? Date.now() + ttl * 1000 : undefined };
      save(d);
    },
    getdel: async (k) => {
      const d = load();
      const v = live(d, k)?.v;
      delete d[k];
      save(d);
      return typeof v === "string" ? v : null;
    },
    incr: async (k) => {
      const d = load();
      const n = Number(live(d, k)?.v ?? 0) + 1;
      d[k] = { v: String(n) };
      save(d);
      return n;
    },
    sadd: async (k, m) => {
      const d = load();
      const set = (live(d, k)?.v as string[] | undefined) ?? [];
      if (set.includes(m)) return false;
      d[k] = { v: [...set, m] };
      save(d);
      return true;
    },
  };
}

let instance: Store | undefined;
export function store(): Store {
  if (!instance) {
    const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
    instance = url && token ? upstash(url, token) : file(process.env.GLASSHOUSE_STORE_FILE ?? join(process.cwd(), ".data", "store.json"));
  }
  return instance;
}

// tests only
export function resetStoreForTests(): void {
  instance = undefined;
}
