// Linking rules from CONTRACTS.md §3. Pure: Ledger in, SameOwnerLink[] out. No mode, no ground truth.
import type { Address, Ledger, SameOwnerLink, Transfer } from "./types";

export const COACTIVITY = {
  windowSec: 90,
  sessionSec: 600,  // "10-minute sessions"
  minSessions: 4,
  minDays: 3,
  minLift: 20,      // observed >= 20x expected; expected = pA * pB * 180 / span
} as const;

const pairKey = (a: Address, b: Address) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// Agent payments: unlabelled wallet → labelled service.
export function agentPayments(ledger: Ledger): Transfer[] {
  const kind = new Map(ledger.wallets.map((w) => [w.addr, w.kind]));
  return ledger.transfers.filter((t) => kind.get(t.from) === "" && kind.get(t.to) === "service");
}

// Rule 1: an unlabelled wallet sends USDC to another unlabelled wallet → same owner.
// Labelled wallets (exchanges, services, pools) never link anything.
export function linkFunding(ledger: Ledger): SameOwnerLink[] {
  const kind = new Map(ledger.wallets.map((w) => [w.addr, w.kind]));
  const pairs = new Map<string, { a: Address; b: Address; n: number; micro: number }>();
  for (const t of ledger.transfers) {
    if (t.from === t.to || kind.get(t.from) !== "" || kind.get(t.to) !== "") continue;
    const key = pairKey(t.from, t.to);
    const p = pairs.get(key) ?? { a: t.from, b: t.to, n: 0, micro: 0 };
    p.n += 1;
    p.micro += toMicro(t.amount);
    pairs.set(key, p);
  }
  return [...pairs.values()].map((p) => ({ a: p.a, b: p.b, rule: "funding", detail: fundingDetail(p.n, p.micro) }));
}

// USDC has 6 decimals; integer micro-units keep sums exact (and identical in GSQL).
export const toMicro = (usdc: number) => Math.round(usdc * 1e6);
export const fundingDetail = (n: number, micro: number) =>
  n === 1 ? `topped up ${micro / 1e6} USDC` : `topped up ${n} times, ${micro / 1e6} USDC`;
export const coactivityDetail = (days: number) => `same 2 minutes on ${days} days`;

// observed >= minLift * expected, with expected = pA * pB * 2 * window / span, in integers.
export const passesLift = (observed: number, pA: number, pB: number, span: number) =>
  observed * span >= COACTIVITY.minLift * pA * pB * 2 * COACTIVITY.windowSec;

// Rule 2: two unlabelled agent wallets pay services within 90 s of each other, in >= 4 distinct
// 10-minute sessions, over >= 3 distinct days, and >= 20x more often than chance.
// observed = number of payment pairs (one from each wallet) within 90 s; span = the ledger window.
export function linkCoactivity(ledger: Ledger): SameOwnerLink[] {
  const pays = agentPayments(ledger).sort((x, y) => x.ts - y.ts);
  const perWallet = new Map<Address, number>();
  for (const p of pays) perWallet.set(p.from, (perWallet.get(p.from) ?? 0) + 1);
  const span = ledger.days * 86_400;

  const pairs = new Map<string, { a: Address; b: Address; observed: number; sessions: Set<number>; days: Set<number> }>();
  for (let i = 0; i < pays.length; i++) {
    const x = pays[i]!;
    for (let j = i + 1; j < pays.length && pays[j]!.ts - x.ts <= COACTIVITY.windowSec; j++) {
      const y = pays[j]!;
      if (y.from === x.from) continue;
      const key = pairKey(x.from, y.from);
      let p = pairs.get(key);
      if (!p) pairs.set(key, (p = { a: x.from < y.from ? x.from : y.from, b: x.from < y.from ? y.from : x.from, observed: 0, sessions: new Set(), days: new Set() }));
      p.observed += 1;
      p.sessions.add(Math.floor(x.ts / COACTIVITY.sessionSec));
      p.days.add(Math.floor(x.ts / 86_400));
    }
  }

  const links: SameOwnerLink[] = [];
  for (const p of pairs.values()) {
    if (p.sessions.size >= COACTIVITY.minSessions && p.days.size >= COACTIVITY.minDays
      && passesLift(p.observed, perWallet.get(p.a)!, perWallet.get(p.b)!, span)) {
      links.push({ a: p.a, b: p.b, rule: "co-activity", detail: coactivityDetail(p.days.size) });
    }
  }
  return links;
}

export function analyze(ledger: Ledger): SameOwnerLink[] {
  return [...linkFunding(ledger), ...linkCoactivity(ledger)];
}
