// Runtime checks that JSON (fixtures, API responses) matches the CONTRACTS.md types.
// Each returns a list of problems; empty means valid.
import type { GraphView, GroundTruth, Ledger, ProfileFacts } from "./types";

type Problems = string[];

const CATEGORIES = ["Health", "Career", "Travel", "Finance", "Legal", "Trading", "Developer"];
const WALLET_KINDS = ["", "exchange", "service", "pool"];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isAddr = (v: unknown) => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const isInt = (v: unknown) => Number.isInteger(v);
const isStr = (v: unknown) => typeof v === "string";

function check(p: Problems, ok: boolean, msg: string) {
  if (!ok) p.push(msg);
}

function checkLinks(p: Problems, links: unknown, at: string) {
  if (!Array.isArray(links)) return p.push(`${at} must be an array`);
  links.forEach((l, i) => {
    const w = `${at}[${i}]`;
    if (!isObj(l)) return p.push(`${w} must be an object`);
    check(p, isAddr(l.a) && isAddr(l.b), `${w}.a/.b must be addresses`);
    check(p, l.rule === "funding" || l.rule === "co-activity", `${w}.rule invalid`);
    check(p, isStr(l.detail), `${w}.detail must be a string`);
  });
}

export function validateLedger(v: unknown): Problems {
  const p: Problems = [];
  if (!isObj(v)) return ["ledger must be an object"];
  check(p, isInt(v.seed) && isInt(v.start_ts) && isInt(v.days), "seed/start_ts/days must be integers");
  if (!Array.isArray(v.wallets)) return [...p, "wallets must be an array"];
  if (!Array.isArray(v.transfers)) return [...p, "transfers must be an array"];
  const known = new Set<unknown>();
  v.wallets.forEach((w, i) => {
    if (!isObj(w)) return p.push(`wallets[${i}] must be an object`);
    check(p, isAddr(w.addr), `wallets[${i}].addr invalid`);
    check(p, WALLET_KINDS.includes(w.kind as string), `wallets[${i}].kind invalid`);
    check(p, isStr(w.label), `wallets[${i}].label must be a string`);
    check(p, w.kind === "service" ? CATEGORIES.includes(w.category as string) : w.category === null,
      `wallets[${i}].category must be a category for services, null otherwise`);
    check(p, !known.has(w.addr), `wallets[${i}].addr duplicated`);
    known.add(w.addr);
  });
  v.transfers.forEach((t, i) => {
    if (!isObj(t)) return p.push(`transfers[${i}] must be an object`);
    check(p, isStr(t.tx), `transfers[${i}].tx must be a string`);
    check(p, known.has(t.from) && known.has(t.to), `transfers[${i}] from/to must be listed wallets`);
    check(p, isNum(t.amount) && (t.amount as number) > 0, `transfers[${i}].amount must be positive`);
    check(p, isInt(t.ts), `transfers[${i}].ts must be an integer`);
  });
  return p;
}

export function validateGroundTruth(v: unknown): Problems {
  if (!isObj(v) || !isObj(v.owners)) return ["truth.owners must be an object"];
  const p: Problems = [];
  for (const [id, addrs] of Object.entries(v.owners)) {
    check(p, Array.isArray(addrs) && addrs.every(isAddr), `owners.${id} must be an address array`);
  }
  return p;
}

export function validateProfileFacts(v: unknown): Problems {
  const p: Problems = [];
  if (!isObj(v)) return ["profile must be an object"];
  check(p, v.mode === "open" || v.mode === "shield", "mode invalid");
  check(p, isAddr(v.seed_wallet), "seed_wallet invalid");
  if (!Array.isArray(v.wallets)) p.push("wallets must be an array");
  else v.wallets.forEach((w, i) => {
    check(p, isObj(w) && isAddr(w.addr) && ["personal", "agent", "one-time"].includes(w.role as string), `wallets[${i}] invalid`);
  });
  checkLinks(p, v.links, "links");
  check(p, v.identity_anchor === null || (isObj(v.identity_anchor) && isStr(v.identity_anchor.exchange_label)),
    "identity_anchor invalid");
  const tz = v.timezone;
  check(p, tz === null || (isObj(tz) && isInt(tz.offset_minutes) && isStr(tz.label)
    && isStr(tz.sleep_start_local) && isStr(tz.sleep_end_local)), "timezone invalid");
  check(p, Array.isArray(v.hourly) && v.hourly.length === 48 && v.hourly.every(isInt), "hourly must be 48 integers");
  if (!Array.isArray(v.signals)) p.push("signals must be an array");
  else v.signals.forEach((s, i) => {
    check(p, isObj(s) && CATEGORIES.includes(s.category as string) && isInt(s.count) && isInt(s.first_ts)
      && isInt(s.last_ts) && isStr(s.text), `signals[${i}] invalid`);
  });
  check(p, isObj(v.spend) && isInt(v.spend.payments) && isNum(v.spend.usdc), "spend invalid");
  check(p, isObj(v.linkability) && isInt(v.linkability.traced) && isInt(v.linkability.total)
    && (v.linkability.traced as number) <= (v.linkability.total as number), "linkability invalid");
  check(p, v.anonymity_set === null || isInt(v.anonymity_set), "anonymity_set must be an integer or null");
  check(p, v.source === "synthetic" || v.source === "base-mainnet", "source invalid");
  return p;
}

export function validateGraphView(v: unknown): Problems {
  const p: Problems = [];
  if (!isObj(v) || !Array.isArray(v.nodes) || !Array.isArray(v.edges)) return ["graph needs nodes and edges arrays"];
  const ids = new Set<unknown>();
  v.nodes.forEach((n, i) => {
    if (!isObj(n)) return p.push(`nodes[${i}] must be an object`);
    check(p, isAddr(n.id) && !ids.has(n.id), `nodes[${i}].id invalid or duplicated`);
    check(p, isStr(n.label), `nodes[${i}].label must be a string`);
    check(p, [...WALLET_KINDS, "one-time"].includes(n.kind as string), `nodes[${i}].kind invalid`);
    check(p, typeof n.owned === "boolean", `nodes[${i}].owned must be a boolean`);
    ids.add(n.id);
  });
  v.edges.forEach((e, i) => {
    if (!isObj(e)) return p.push(`edges[${i}] must be an object`);
    check(p, ids.has(e.source) && ids.has(e.target), `edges[${i}] must join listed nodes`);
    check(p, e.type === "TRANSFER" || e.type === "SAME_OWNER", `edges[${i}].type invalid`);
    check(p, isStr(e.label), `edges[${i}].label must be a string`);
  });
  return p;
}

// Type guards over the validators, for callers that need the narrowed type.
export const isLedger = (v: unknown): v is Ledger => validateLedger(v).length === 0;
export const isGroundTruth = (v: unknown): v is GroundTruth => validateGroundTruth(v).length === 0;
export const isProfileFacts = (v: unknown): v is ProfileFacts => validateProfileFacts(v).length === 0;
export const isGraphView = (v: unknown): v is GraphView => validateGraphView(v).length === 0;
