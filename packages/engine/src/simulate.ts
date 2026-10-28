import { createRng, type Rng } from "./rng";
import type { Address, Category, GroundTruth, Ledger, Transfer, WalletInfo } from "./types";

export type Mode = "open" | "shield";

export const START_TS = Date.UTC(2026, 9, 18) / 1000; // 18 Oct 2026 00:00 UTC
export const DAYS = 10;
const DAY = 86_400;
const END_TS = START_TS + DAYS * DAY;
const EARLIEST_SESSION = START_TS + 3 * 3600; // leaves room to fund wallets before the first payment
const SESSION_SPREAD = 150;                  // one session's payments land within this many seconds
const RAIL_DEPOSIT = 10;                     // USDC, fixed by Rail.sol
const RAIL_RELEASE = 1;

export const EXCHANGES = ["Exchange A", "Exchange B", "Exchange C", "Exchange D"] as const;
export const RAIL_LABEL = "Shield Rail";

// price in micro-USDC per call
export const SERVICES: { label: string; category: Category; price: number }[] = [
  { label: "SymptomCheck API", category: "Health", price: 20_000 },
  { label: "MedLookup", category: "Health", price: 15_000 },
  { label: "ClinicFinder", category: "Health", price: 10_000 },
  { label: "JobBoard Pro", category: "Career", price: 10_000 },
  { label: "ResumeRank", category: "Career", price: 25_000 },
  { label: "SalaryScope", category: "Career", price: 15_000 },
  { label: "FlightScan", category: "Travel", price: 30_000 },
  { label: "StayFinder", category: "Travel", price: 20_000 },
  { label: "VisaCheck", category: "Travel", price: 40_000 },
  { label: "TaxHelper", category: "Finance", price: 50_000 },
  { label: "LoanCompare", category: "Finance", price: 30_000 },
  { label: "ContractReview", category: "Legal", price: 50_000 },
  { label: "PriceFeed", category: "Trading", price: 5_000 },
  { label: "ChainAlpha", category: "Trading", price: 20_000 },
  { label: "CodeSearch", category: "Developer", price: 10_000 },
  { label: "DocsQA", category: "Developer", price: 5_000 },
];
const CATEGORIES = [...new Set(SERVICES.map((s) => s.category))];
const TIMEZONES = [-480, -300, -240, 0, 60, 120, 330, 480, 540, 600];

interface AgentSpec {
  fundedBy: "personal" | (typeof EXCHANGES)[number];
  fund: number;
  counts: Partial<Record<Category, number>>;
  anchor?: boolean;                                   // puts one payment in every anchor session
  own?: { sessions: number; days: [number, number] }; // pays only in its own sessions (local days, inclusive)
}

interface PersonSpec {
  id: string;
  tz: number;               // minutes east of UTC
  wake: [number, number];   // local minutes; end may pass midnight (e.g. 1500 = 01:00 next day)
  anchored: boolean;        // one shared session in every 30-min waking slot
  extraSessions: number;
  personalExchange: (typeof EXCHANGES)[number];
  agents: AgentSpec[];
}

// "You": UTC+05:30. Agents pay 09:00–01:00 local, so the sleep gap (01:00–09:00 local)
// is centred on 05:00 and snaps to +05:30. The travel agent is funded straight from an
// exchange, so only Rule 2 (co-activity with the work agent) can link it.
const YOU: PersonSpec = {
  id: "you",
  tz: 330,
  wake: [9 * 60, 25 * 60],
  anchored: true,
  extraSessions: 16,
  personalExchange: "Exchange A",
  agents: [
    { fundedBy: "personal", fund: 25, counts: { Career: 70, Finance: 12, Legal: 6, Developer: 4 } },
    { fundedBy: "personal", fund: 10, counts: { Health: 36 }, own: { sessions: 6, days: [6, 8] } }, // 24–26 Oct
    { fundedBy: "Exchange A", fund: 20, counts: { Travel: 110 }, anchor: true },
  ],
};

const OTHERS: PersonSpec[] = [
  {
    id: "p2", tz: -300, wake: [7 * 60, 23.5 * 60], anchored: true, extraSessions: 10, personalExchange: "Exchange B",
    agents: [
      { fundedBy: "personal", fund: 30, counts: { Developer: 40, Trading: 12 }, anchor: true },
      { fundedBy: "personal", fund: 15, counts: { Career: 8, Finance: 6 } },
    ],
  },
  {
    id: "p3", tz: 60, wake: [8 * 60, 24 * 60], anchored: true, extraSessions: 8, personalExchange: "Exchange C",
    agents: [
      { fundedBy: "personal", fund: 40, counts: { Trading: 50 }, anchor: true },
      { fundedBy: "Exchange C", fund: 15, counts: { Travel: 20, Legal: 2 } },
    ],
  },
  {
    id: "p4", tz: 480, wake: [8.5 * 60, 24.5 * 60], anchored: true, extraSessions: 12, personalExchange: "Exchange D",
    agents: [
      { fundedBy: "Exchange D", fund: 30, counts: { Developer: 60 }, anchor: true },
      { fundedBy: "Exchange D", fund: 10, counts: { Health: 10, Finance: 4 } },
      { fundedBy: "Exchange B", fund: 10, counts: { Career: 15 } },
    ],
  },
  {
    id: "p5", tz: 540, wake: [7.5 * 60, 23 * 60], anchored: true, extraSessions: 6, personalExchange: "Exchange A",
    agents: [{ fundedBy: "personal", fund: 25, counts: { Trading: 30, Developer: 10 }, anchor: true }],
  },
];

const BACKGROUND_AGENTS = 260;
const RAIL_USERS = 220;

interface Payment { ts: number; to: Address; micro: number }
interface PlannedAgent { addr: Address; fundedBy: Address; fund: number; fundTs: number; sessions: Payment[][] }
interface PlannedPerson {
  id: string;
  personal: { addr: Address; fundedBy: Address; fund: number; fundTs: number } | null;
  agents: PlannedAgent[];
}

export interface Simulation {
  ledger: Ledger;
  truth: GroundTruth;
  // For tests and fixture building only. agents = the 3 agent wallets (open) or every one-time wallet (shield).
  you: { personal: Address; agents: Address[] };
}

export function simulate(seed: number, mode: Mode = "open"): Simulation {
  const rng = createRng(seed);
  const addr = (r: Rng = rng): Address => `0x${r.hex(40)}`;

  const exchanges = Object.fromEntries(EXCHANGES.map((label) => [label, addr()])) as Record<(typeof EXCHANGES)[number], Address>;
  const services = SERVICES.map((s) => ({ ...s, addr: addr() }));
  const rail = addr();
  const labelled: WalletInfo[] = [
    ...EXCHANGES.map((label): WalletInfo => ({ addr: exchanges[label], kind: "exchange", label, category: null })),
    ...services.map((s): WalletInfo => ({ addr: s.addr, kind: "service", label: s.label, category: s.category })),
    { addr: rail, kind: "pool", label: RAIL_LABEL, category: null },
  ];
  const pay = (category: Category, ts: number): Payment => {
    const s = rng.pick(services.filter((x) => x.category === category));
    return { ts, to: s.addr, micro: s.price };
  };

  // --- plan every person's activity (identical in both modes) ---
  const planPerson = (spec: PersonSpec): PlannedPerson => {
    const anchors = spec.anchored ? anchorSessions(rng, spec) : [];
    const shared = [...anchors];
    for (let i = 0; i < spec.extraSessions; i++) shared.push(randomSession(rng, spec, [0, DAYS - 1]));

    const agents = spec.agents.map((a): PlannedAgent => {
      const cats = rng.shuffle(Object.entries(a.counts).flatMap(([c, n]) => Array<Category>(n).fill(c as Category)));
      const starts = a.own
        ? Array.from({ length: a.own.sessions }, () => randomSession(rng, spec, a.own!.days))
        : shared;
      const buckets: Category[][] = starts.map(() => []);
      // guaranteed slots first: every anchor session (anchor agent) or every own session
      const guaranteed = a.anchor ? anchors.length : a.own ? starts.length : 0;
      cats.forEach((c, i) => buckets[i < guaranteed ? i : rng.int(0, starts.length - 1)]!.push(c));
      const sessions = buckets
        .map((b, i) => b.map((c) => pay(c, starts[i]! + rng.int(0, SESSION_SPREAD))).sort((x, y) => x.ts - y.ts))
        .filter((s) => s.length > 0);
      const first = Math.min(...sessions.map((s) => s[0]!.ts));
      return { addr: addr(), fundedBy: rail, fund: a.fund, fundTs: first - rng.int(600, 3600), sessions };
    });

    const needsPersonal = spec.agents.some((a) => a.fundedBy === "personal");
    const firstPay = Math.min(...agents.flatMap((a) => a.sessions.map((s) => s[0]!.ts)));
    const personal = needsPersonal
      ? { addr: addr(), fundedBy: exchanges[spec.personalExchange], fund: rng.int(250, 400), fundTs: firstPay - rng.int(7200, 10800) }
      : null;
    spec.agents.forEach((a, i) => {
      agents[i]!.fundedBy = a.fundedBy === "personal" ? personal!.addr : exchanges[a.fundedBy];
    });
    return { id: spec.id, personal, agents };
  };

  const you = planPerson(YOU);
  const people = [you, ...OTHERS.map(planPerson)];

  // background crowd: independent agents, no shared sessions
  let bgAgents = 0;
  for (let i = 1; bgAgents < BACKGROUND_AGENTS; i++) {
    const n = Math.min(rng.int(1, 3), BACKGROUND_AGENTS - bgAgents);
    const hasPersonal = rng.next() < 0.5;
    const favourite = rng.shuffle([...CATEGORIES]).slice(0, rng.int(1, 2));
    const spec: PersonSpec = {
      id: `bg-${String(i).padStart(3, "0")}`,
      tz: rng.pick(TIMEZONES),
      wake: [7 * 60, 24 * 60],
      anchored: false,
      extraSessions: 0,
      personalExchange: rng.pick(EXCHANGES),
      agents: Array.from({ length: n }, (): AgentSpec => {
        const sessions = rng.int(3, 10);
        const counts: Partial<Record<Category, number>> = {};
        for (let p = rng.int(sessions, sessions * 4); p > 0; p--) {
          const c = rng.pick(favourite);
          counts[c] = (counts[c] ?? 0) + 1;
        }
        return {
          fundedBy: hasPersonal ? "personal" : rng.pick(EXCHANGES),
          fund: rng.int(5, 40),
          counts,
          own: { sessions, days: [0, DAYS - 1] },
        };
      }),
    };
    people.push(planPerson(spec));
    bgAgents += n;
  }

  // other rail users: deposit once early, then pay from one-time wallets
  const railUsers = Array.from({ length: RAIL_USERS }, (_, i) => {
    const spec: PersonSpec = {
      id: `rail-${String(i + 1).padStart(3, "0")}`, tz: rng.pick(TIMEZONES), wake: [7 * 60, 24 * 60],
      anchored: false, extraSessions: 0, personalExchange: rng.pick(EXCHANGES), agents: [],
    };
    const depositor = addr();
    const fundTs = START_TS + rng.int(0, 3599);
    const depositTs = START_TS + rng.int(3600, 10_800);
    const favourite = rng.shuffle([...CATEGORIES]).slice(0, rng.int(1, 2));
    const oneTime = Array.from({ length: rng.int(1, 4) }, () => {
      let start = randomSession(rng, spec, [0, DAYS - 1]);
      while (start < depositTs + 600) start = randomSession(rng, spec, [0, DAYS - 1]);
      const payments = Array.from({ length: rng.int(1, 6) }, () => pay(rng.pick(favourite), start + rng.int(0, SESSION_SPREAD)))
        .sort((x, y) => x.ts - y.ts);
      return { addr: addr(), fundTs: start - rng.int(20, 120), payments };
    });
    return { id: spec.id, exchange: exchanges[spec.personalExchange], depositor, fundTs, depositTs, oneTime };
  });

  // --- render the ledger ---
  const transfers: Omit<Transfer, "tx">[] = [];
  const owners: Record<string, Address[]> = {};
  const send = (from: Address, to: Address, amount: number, ts: number) => transfers.push({ from, to, amount, ts });
  const payAll = (from: Address, payments: Payment[]) => payments.forEach((p) => send(from, p.to, p.micro / 1e6, p.ts));

  const renderOpen = (p: PlannedPerson) => {
    if (p.personal) send(p.personal.fundedBy, p.personal.addr, p.personal.fund, p.personal.fundTs);
    for (const a of p.agents) {
      send(a.fundedBy, a.addr, a.fund, a.fundTs);
      a.sessions.forEach((s) => payAll(a.addr, s));
    }
    owners[p.id] = [...(p.personal ? [p.personal.addr] : []), ...p.agents.map((a) => a.addr)];
  };

  let youAgents: Address[];
  if (mode === "open") {
    people.forEach(renderOpen);
    youAgents = you.agents.map((a) => a.addr);
  } else {
    people.slice(1).forEach(renderOpen);
    // Shield: same activity, but each agent session pays from a fresh one-time wallet funded by the rail.
    const shieldRng = createRng(seed + 0x51e1d);
    const personal = you.personal!;
    send(personal.fundedBy, personal.addr, personal.fund, personal.fundTs);
    const releases = you.agents
      .flatMap((a) => a.sessions)
      .map((payments) => ({ addr: addr(shieldRng), fundTs: payments[0]!.ts - shieldRng.int(20, 120), payments }))
      .sort((x, y) => x.fundTs - y.fundTs);
    const byDay = Map.groupBy(releases, (r) => Math.floor((r.fundTs - START_TS) / DAY));
    for (const day of byDay.values()) {
      const deposits = Math.ceil((day.length * RAIL_RELEASE) / RAIL_DEPOSIT);
      const at = day[0]!.fundTs - shieldRng.int(600, 1800);
      for (let j = 0; j < deposits; j++) send(personal.addr, rail, RAIL_DEPOSIT, at - j * 60);
    }
    for (const r of releases) {
      send(rail, r.addr, RAIL_RELEASE, r.fundTs);
      payAll(r.addr, r.payments);
    }
    youAgents = releases.map((r) => r.addr);
    owners.you = [personal.addr, ...youAgents];
  }

  for (const u of railUsers) {
    send(u.exchange, u.depositor, 25, u.fundTs);
    send(u.depositor, rail, RAIL_DEPOSIT, u.depositTs);
    for (const o of u.oneTime) {
      send(rail, o.addr, RAIL_RELEASE, o.fundTs);
      payAll(o.addr, o.payments);
    }
    owners[u.id] = [u.depositor, ...u.oneTime.map((o) => o.addr)];
  }

  transfers.sort((x, y) => x.ts - y.ts || x.from.localeCompare(y.from) || x.to.localeCompare(y.to));
  const txRng = createRng(seed * 7919 + (mode === "shield" ? 1 : 0));
  const unlabelled = Object.values(owners).flat().map((a): WalletInfo => ({ addr: a, kind: "", label: "", category: null }));

  return {
    ledger: {
      seed,
      start_ts: START_TS,
      days: DAYS,
      // sorted by address so wallet order leaks nothing about ownership
      wallets: [...labelled, ...unlabelled].sort((x, y) => x.addr.localeCompare(y.addr)),
      transfers: transfers.map((t) => ({ tx: `0x${txRng.hex(64)}`, ...t })),
    },
    truth: { owners },
    you: { personal: you.personal!.addr, agents: youAgents },
  };
}

const inRange = (ts: number) => ts >= EARLIEST_SESSION && ts + SESSION_SPREAD < END_TS;

// One session start inside each 30-min waking slot, on a random day where it fits.
function anchorSessions(rng: Rng, spec: PersonSpec): number[] {
  const starts: number[] = [];
  for (let slot = spec.wake[0]; slot < spec.wake[1]; slot += 30) {
    const days = rng.shuffle(Array.from({ length: DAYS }, (_, d) => d));
    const offset = rng.int(0, 1800 - SESSION_SPREAD);
    const ts = days.map((d) => START_TS + d * DAY + (slot - spec.tz) * 60 + offset).find(inRange);
    if (ts === undefined) throw new Error(`no day fits slot ${slot} for ${spec.id}`);
    starts.push(ts);
  }
  return starts;
}

function randomSession(rng: Rng, spec: PersonSpec, days: [number, number]): number {
  for (;;) {
    const ts = START_TS + rng.int(days[0], days[1]) * DAY + (spec.wake[0] - spec.tz) * 60
      + rng.int(0, (spec.wake[1] - spec.wake[0]) * 60 - SESSION_SPREAD);
    if (inRange(ts)) return ts;
  }
}
