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
  const pairs = new Map<string, { a: Address; b: Address; n: number; usdc: number }>();
  for (const t of ledger.transfers) {
    if (t.from === t.to || kind.get(t.from) !== "" || kind.get(t.to) !== "") continue;
    const key = pairKey(t.from, t.to);
    const p = pairs.get(key) ?? { a: t.from, b: t.to, n: 0, usdc: 0 };
    p.n += 1;
    p.usdc = Math.round((p.usdc + t.amount) * 1e6) / 1e6;
    pairs.set(key, p);
  }
  return [...pairs.values()].map((p) => ({
    a: p.a,
    b: p.b,
    rule: "funding",
    detail: p.n === 1 ? `topped up ${p.usdc} USDC` : `topped up ${p.n} times, ${p.usdc} USDC`,
  }));
}

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
    const expected = (perWallet.get(p.a)! * perWallet.get(p.b)! * 2 * COACTIVITY.windowSec) / span;
    if (p.sessions.size >= COACTIVITY.minSessions && p.days.size >= COACTIVITY.minDays && p.observed >= COACTIVITY.minLift * expected) {
      links.push({ a: p.a, b: p.b, rule: "co-activity", detail: `same 2 minutes on ${p.days.size} days` });
    }
  }
  return links;
}

export function analyze(ledger: Ledger): SameOwnerLink[] {
  return [...linkFunding(ledger), ...linkCoactivity(ledger)];
}
