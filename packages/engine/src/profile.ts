// What a stranger can build from a ledger plus the SAME_OWNER links, starting at one wallet.
// Pure: no I/O, no ground truth, no mode-specific logic in the linking.
import { agentPayments } from "./analyze";
import { SIGNAL_RULES } from "./constants";
import type { Address, Category, Ledger, ProfileFacts, SameOwnerLink, Signal } from "./types";

export const TIMEZONE = {
  minPayments: 15,
  minGapSlots: 10,           // 5 h
  maxGapSlots: 30,           // 15 h
  gapCentreLocalMin: 5 * 60, // the sleep gap is assumed to be centred on 05:00 local
} as const;

// Offsets in use worldwide, minutes east of UTC.
const REAL_OFFSETS = [
  -720, -660, -600, -570, -540, -480, -420, -360, -300, -240, -210, -180, -120, -60, 0, 60, 120, 180, 210, 240,
  270, 300, 330, 345, 360, 390, 420, 480, 525, 540, 570, 600, 630, 660, 720, 765, 780, 840,
];

export interface ProfileOptions {
  mode: "open" | "shield";
  // Wallets the owner knows are theirs (e.g. one-time wallets from their own Shield session).
  // Used only for linkability.total and anonymity_set, never for linking.
  ownWallets?: Address[];
  source?: ProfileFacts["source"];
}

// All wallets reachable from the seed over SAME_OWNER links (breadth-first, seed first).
export function cluster(seed: Address, links: SameOwnerLink[]): Address[] {
  const adj = new Map<Address, Address[]>();
  for (const l of links) {
    adj.set(l.a, [...(adj.get(l.a) ?? []), l.b]);
    adj.set(l.b, [...(adj.get(l.b) ?? []), l.a]);
  }
  const seen = new Set<Address>([seed]);
  const queue = [seed];
  for (let i = 0; i < queue.length; i++) {
    for (const n of adj.get(queue[i]!) ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return queue;
}

const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export function offsetLabel(offset: number): string {
  return `UTC${offset < 0 ? "-" : "+"}${hhmm(Math.abs(offset))}`;
}

// 48-slot method: longest circular run of empty 30-min UTC slots (5–15 h) is sleep;
// its centre is 05:00 local; snap to the nearest real offset.
export function inferTimezone(hourly: number[]): ProfileFacts["timezone"] {
  const total = hourly.reduce((s, n) => s + n, 0);
  if (total < TIMEZONE.minPayments || hourly.every((n) => n === 0)) return null;
  let best = { start: 0, len: 0 };
  for (let start = 0; start < 48; start++) {
    if (hourly[start] !== 0 || hourly[(start + 47) % 48] === 0) continue; // runs start after a busy slot
    let len = 0;
    while (len < 48 && hourly[(start + len) % 48] === 0) len++;
    if (len > best.len) best = { start, len };
  }
  if (best.len < TIMEZONE.minGapSlots || best.len > TIMEZONE.maxGapSlots) return null;

  const startMin = best.start * 30;
  const centreUtc = startMin + best.len * 15;
  let raw = (((TIMEZONE.gapCentreLocalMin - centreUtc) % 1440) + 1440) % 1440;
  if (raw > 840) raw -= 1440;
  const offset = REAL_OFFSETS.reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a));
  return {
    offset_minutes: offset,
    label: offsetLabel(offset),
    sleep_start_local: hhmm(startMin + offset),
    sleep_end_local: hhmm(startMin + best.len * 30 + offset),
  };
}

export function profile(ledger: Ledger, links: SameOwnerLink[], seed: Address, opts: ProfileOptions): ProfileFacts {
  const info = new Map(ledger.wallets.map((w) => [w.addr, w]));
  const members = cluster(seed, links);
  const inCluster = new Set(members);
  const allPays = agentPayments(ledger);
  const pays = allPays.filter((t) => inCluster.has(t.from));
  const payers = new Set(pays.map((t) => t.from));
  const releasedTo = new Set(ledger.transfers.filter((t) => info.get(t.from)?.kind === "pool").map((t) => t.to));

  const hourly = Array<number>(48).fill(0);
  for (const p of pays) hourly[Math.floor((p.ts % 86_400) / 1800)]! += 1;

  // services of unknown category (real-chain x402 sellers) count as payments but give no signal
  const categorized = pays.filter((p) => info.get(p.to)?.category != null);
  const signals: Signal[] = [...Map.groupBy(categorized, (p) => info.get(p.to)!.category as Category)]
    .filter(([c, ps]) => ps.length >= SIGNAL_RULES[c].min)
    .map(([category, ps]) => ({
      category,
      count: ps.length,
      first_ts: Math.min(...ps.map((p) => p.ts)),
      last_ts: Math.max(...ps.map((p) => p.ts)),
      text: SIGNAL_RULES[category].text,
    }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  const anchor = ledger.transfers
    .filter((t) => inCluster.has(t.to) && info.get(t.from)?.kind === "exchange")
    .sort((a, b) => Number(b.to === seed) - Number(a.to === seed) || a.ts - b.ts)[0];

  const own = new Set([...(opts.ownWallets ?? []), ...members]);
  const total = allPays.filter((t) => own.has(t.from)).length;

  // shield: distinct depositors into the pool before the owner's first one-time wallet was funded
  let anonymity_set: number | null = null;
  if (opts.mode === "shield") {
    const releases = ledger.transfers.filter((t) => info.get(t.from)?.kind === "pool" && own.has(t.to));
    if (releases.length > 0) {
      const first = Math.min(...releases.map((t) => t.ts));
      anonymity_set = new Set(ledger.transfers
        .filter((t) => info.get(t.to)?.kind === "pool" && t.ts < first)
        .map((t) => t.from)).size;
    }
  }

  return {
    mode: opts.mode,
    seed_wallet: seed,
    wallets: members.map((addr) => ({
      addr,
      role: releasedTo.has(addr) ? "one-time" : payers.has(addr) ? "agent" : "personal",
    })),
    links: links.filter((l) => inCluster.has(l.a) && inCluster.has(l.b)),
    identity_anchor: anchor ? { exchange_label: info.get(anchor.from)!.label } : null,
    timezone: inferTimezone(hourly),
    hourly,
    signals,
    spend: { payments: pays.length, usdc: Math.round(pays.reduce((s, p) => s + p.amount, 0) * 1e6) / 1e6 },
    linkability: { traced: pays.length, total },
    anonymity_set,
    source: opts.source ?? "synthetic",
  };
}
