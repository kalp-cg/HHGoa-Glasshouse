// Real-chain self-audit: challenge → signature → Base mainnet ingest → the same engine analysis.
// Only the wallet's verified owner ever sees its profile (AGENTS.md safety rules).
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { analyze, profile, type Address, type Ledger, type ProfileFacts } from "@glasshouse/engine";
import { HttpError } from "./http";
import { store } from "./store";

export const NONCE_TTL_SEC = 5 * 60;
const BLOCKS_PER_DAY = 43_200; // Base: one block every 2 s

export function parseAddress(v: unknown): Address {
  if (typeof v !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(v)) throw new HttpError(400, "address must be a 0x address");
  return v.toLowerCase() as Address;
}

// The product's id for a user is their verified wallet, hashed: never stored or sent in clear.
export const userIdFor = (address: Address) =>
  createHash("sha256").update(`glasshouse:${address.toLowerCase()}`).digest("hex").slice(0, 32);

export function challengeMessage(address: Address, nonce: string, expiresAt: number): string {
  return [
    "Glasshouse: prove you own this wallet so you can see what its payments reveal.",
    "Signing is free and does not move funds.",
    `Wallet: ${address}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expiresAt * 1000).toISOString()}`,
  ].join("\n");
}

export async function createChallenge(address: Address): Promise<{ message: string; nonce: string; expires_at: number }> {
  const nonce = randomBytes(16).toString("hex");
  const expires_at = Math.floor(Date.now() / 1000) + NONCE_TTL_SEC;
  await store().set(`nonce:${nonce}`, JSON.stringify({ address, expires_at }), NONCE_TTL_SEC);
  return { message: challengeMessage(address, nonce, expires_at), nonce, expires_at };
}

// Single use: the nonce is deleted on first read, whatever the outcome.
export async function consumeChallenge(address: Address, nonce: unknown): Promise<string> {
  if (typeof nonce !== "string" || !/^[0-9a-f]{32}$/.test(nonce)) throw new HttpError(400, "nonce missing or malformed");
  const raw = await store().getdel(`nonce:${nonce}`);
  if (!raw) throw new HttpError(401, "challenge expired or already used; request a new one");
  const saved = JSON.parse(raw) as { address: Address; expires_at: number };
  if (saved.address !== address) throw new HttpError(401, "challenge was issued for a different wallet");
  if (saved.expires_at < Date.now() / 1000) throw new HttpError(401, "challenge expired; request a new one");
  return challengeMessage(address, nonce, saved.expires_at);
}

// Recipients of the wallet's x402-style (EIP-3009) payments are the services it paid. Their category is unknown,
// so they count as payments (rhythm, time zone, spend) but give no life signal.
export function labelSellers(ledger: Ledger, address: Address): Ledger {
  const sellers = new Set(ledger.transfers.filter((t) => t.from === address).map((t) => t.to));
  return {
    ...ledger,
    wallets: ledger.wallets.map((w) =>
      sellers.has(w.addr) && w.addr !== address
        ? { ...w, kind: "service", label: `x402 service ${w.addr.slice(0, 6)}…${w.addr.slice(-4)}`, category: null }
        : w),
  };
}

// A wallet that has sent this many transactions is an exchange or a service, not a person's own wallet.
const HIGH_VOLUME_SENDS = 1000;
const MAX_FUNDERS_CHECKED = 20;

// Who funded the wallet? Under the funding rule an unlabelled funder would count as the person's own wallet, which
// is wrong for an exchange's hot wallet. A high-volume funder is labelled as the likely exchange instead, so it
// becomes the identity anchor rather than "your wallet".
export async function labelFunders(ledger: Ledger, address: Address): Promise<Ledger> {
  const kind = new Map(ledger.wallets.map((w) => [w.addr, w.kind]));
  const funders = [...new Set(ledger.transfers.filter((t) => t.to === address && t.from !== address).map((t) => t.from))]
    .filter((a) => kind.get(a) === "")
    .slice(0, MAX_FUNDERS_CHECKED);
  const sends = await Promise.all(funders.map((a) =>
    rpc("eth_getTransactionCount", [a, "latest"]).then((n) => Number(BigInt(n)), () => 0)));
  const busy = new Set(funders.filter((_, i) => sends[i]! >= HIGH_VOLUME_SENDS));
  return {
    ...ledger,
    wallets: ledger.wallets.map((w) =>
      busy.has(w.addr) ? { ...w, kind: "exchange", label: "a high-volume wallet (probably an exchange)", category: null } : w),
  };
}

export async function auditProfile(ledger: Ledger, address: Address): Promise<ProfileFacts> {
  const labelled = await labelFunders(labelSellers(ledger, address), address);
  return profile(labelled, analyze(labelled), address, { mode: "open", source: "base-mainnet" });
}

async function rpc(method: string, params: unknown[]): Promise<string> {
  const res = await fetch(process.env.BASE_RPC_URL || "https://mainnet.base.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json()) as { result?: string; error?: { message: string } };
  if (!body.result) throw new HttpError(502, `Base RPC: ${body.error?.message ?? res.status}`);
  return body.result;
}

const latestBlock = async () => BigInt(await rpc("eth_blockNumber", []));

// AUDIT_DAYS (default 1) of history. Public RPCs rate-limit eth_getLogs; set BASE_RPC_URL to a provider for more.
export async function blockRange(): Promise<{ fromBlock: bigint; toBlock: bigint }> {
  const toBlock = await latestBlock();
  const days = Math.max(1, Number(process.env.AUDIT_DAYS ?? 1));
  return { fromBlock: toBlock - BigInt(Math.round(days * BLOCKS_PER_DAY)), toBlock };
}

// Each audit reads the chain, so signed audits are capped per hour to protect the RPC quota.
export async function auditBudget(): Promise<void> {
  const cap = Number(process.env.AUDITS_PER_HOUR ?? 60);
  if ((await store().incr(`audit:hour:${Math.floor(Date.now() / 3_600_000)}`)) > cap) {
    throw new HttpError(429, "Glasshouse is busy right now; please try your audit again in a few minutes");
  }
}

// Totals only. Wallets are deduped by their hash; nothing else about them is kept. Only agent wallets count (at
// least one payment), so throwaway wallets cannot inflate the number.
export async function recordAudit(address: Address, facts: ProfileFacts): Promise<void> {
  if (facts.spend.payments === 0) return;
  const id = userIdFor(address);
  const s = store();
  if (await s.sadd("audited", id)) await s.incr("stats:audits");
  if (facts.timezone && (await s.sadd("leaked_tz", id))) await s.incr("stats:leaking_timezone");
}

export async function stats(): Promise<{ audits: number; leaking_timezone: number }> {
  const s = store();
  return { audits: Number((await s.get("stats:audits")) ?? 0), leaking_timezone: Number((await s.get("stats:leaking_timezone")) ?? 0) };
}

// --- a short-lived session for the verified wallet (for alert settings after an audit) ---

const SESSION_TTL_SEC = 60 * 60;
export const SESSION_COOKIE = "gh_session";

function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new HttpError(503, "SESSION_SECRET is not configured");
  return s;
}

export function signSession(address: Address, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ uid: userIdFor(address), exp: Math.floor(now / 1000) + SESSION_TTL_SEC })).toString("base64url");
  const mac = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function readSession(req: Request): { uid: string } {
  const raw = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  const [payload, mac] = raw?.split(".") ?? [];
  if (!payload || !mac) throw new HttpError(401, "audit your wallet first");
  const want = createHmac("sha256", sessionSecret()).update(payload).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new HttpError(401, "invalid session");
  const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { uid: string; exp: number };
  if (exp < Date.now() / 1000) throw new HttpError(401, "session expired; audit again");
  return { uid };
}

export const sessionCookie = (token: string) =>
  `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SEC}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
