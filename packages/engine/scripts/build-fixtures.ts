// Writes fixtures/ for seed 42. Phase 0: profile and graph fixtures are derived from ground
// truth (the values the engine must reproduce in Phase 1). Phase 1 regenerates them from the engine.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SIGNAL_RULES } from "../src/constants";
import { simulate, type Simulation } from "../src/simulate";
import type { Address, Category, GraphView, Ledger, ProfileFacts, SameOwnerLink, Signal, Transfer } from "../src/types";

const SEED = 42;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures");
const CROWD_NODES = 200; // keeps each graph under ~300 nodes

// Hand-checked for "you": agents silent 01:00–09:00 local, gap centred on 05:00 local.
const YOU_TIMEZONE = { offset_minutes: 330, label: "UTC+05:30", sleep_start_local: "01:00", sleep_end_local: "09:00" };

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const short = (a: Address) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function index(ledger: Ledger) {
  const info = new Map(ledger.wallets.map((w) => [w.addr, w]));
  const isPayment = (t: Transfer) => info.get(t.from)?.kind === "" && info.get(t.to)?.kind === "service";
  return { info, isPayment };
}

function profile(sim: Simulation, mode: "open" | "shield"): ProfileFacts {
  const { ledger, you } = sim;
  const { info, isPayment } = index(ledger);
  const traced = new Set(mode === "open" ? you.agents : []);
  const pays = ledger.transfers.filter((t) => isPayment(t) && traced.has(t.from));
  const total = ledger.transfers.filter((t) => isPayment(t) && you.agents.includes(t.from)).length;

  const hourly = Array<number>(48).fill(0);
  for (const p of pays) hourly[Math.floor((p.ts % 86_400) / 1800)]! += 1;

  const byCat = Map.groupBy(pays, (p) => info.get(p.to)!.category!);
  const signals: Signal[] = [...byCat.entries()]
    .filter(([c, ps]) => ps.length >= SIGNAL_RULES[c].min)
    .map(([category, ps]): Signal => ({
      category,
      count: ps.length,
      first_ts: ps[0]!.ts,
      last_ts: ps.at(-1)!.ts,
      text: SIGNAL_RULES[category as Category].text,
    }))
    .sort((a, b) => b.count - a.count);

  const anchorTransfer = ledger.transfers.find((t) => t.to === you.personal && info.get(t.from)?.kind === "exchange")!;
  const railAddr = ledger.wallets.find((w) => w.kind === "pool")!.addr;
  const firstRelease = Math.min(...ledger.transfers.filter((t) => t.from === railAddr && you.agents.includes(t.to)).map((t) => t.ts));
  const depositorsBefore = new Set(ledger.transfers.filter((t) => t.to === railAddr && t.ts < firstRelease).map((t) => t.from));

  return {
    mode,
    seed_wallet: you.personal,
    wallets: [
      { addr: you.personal, role: "personal" },
      ...[...traced].map((addr) => ({ addr, role: "agent" as const })),
    ],
    links: mode === "open" ? expectedLinks(sim) : [],
    identity_anchor: { exchange_label: info.get(anchorTransfer.from)!.label },
    timezone: mode === "open" ? YOU_TIMEZONE : null,
    hourly,
    signals,
    spend: { payments: pays.length, usdc: round6(pays.reduce((s, p) => s + p.amount, 0)) },
    linkability: { traced: pays.length, total },
    anonymity_set: mode === "shield" ? depositorsBefore.size : null,
    source: "synthetic",
  };
}

// Open mode: personal wallet funds the work and health agents (Rule 1); the exchange-funded
// travel agent is caught only by co-activity with the work agent (Rule 2).
function expectedLinks(sim: Simulation): SameOwnerLink[] {
  const { ledger, you } = sim;
  const [work, , travel] = you.agents as [Address, Address, Address];
  const funding = ledger.transfers
    .filter((t) => t.from === you.personal && you.agents.includes(t.to))
    .map((t): SameOwnerLink => ({ a: t.from, b: t.to, rule: "funding", detail: `topped up ${t.amount} USDC` }));
  const ts = (w: Address) => ledger.transfers.filter((t) => t.from === w && t.to !== w).map((t) => t.ts);
  const travelTs = ts(travel);
  const days = new Set(ts(work).filter((x) => travelTs.some((y) => Math.abs(x - y) <= 90)).map((x) => Math.floor(x / 86_400)));
  return [...funding, { a: work, b: travel, rule: "co-activity", detail: `same 2 minutes on ${days.size} days` }];
}

function graph(sim: Simulation, p: ProfileFacts): GraphView {
  const { ledger, you } = sim;
  const { info, isPayment } = index(ledger);
  const owned = new Set(p.wallets.map((w) => w.addr));
  const railAddr = ledger.wallets.find((w) => w.kind === "pool")!.addr;
  const releasedTo = new Set(ledger.transfers.filter((t) => t.from === railAddr).map((t) => t.to));

  // the person's own transfers, plus a crowd touching the same services (open) or the rail (shield)
  // shield: the person's one-time wallets are drawn, but nothing marks them as theirs
  const yours = new Set([...owned, ...(p.mode === "shield" ? you.agents : [])]);
  const mine = ledger.transfers.filter((t) => yours.has(t.from) || yours.has(t.to));
  const youServices = new Set(ledger.transfers.filter((t) => you.agents.includes(t.from) && isPayment(t)).map((t) => t.to));
  const crowdPool = [...new Set(ledger.transfers
    .filter((t) => p.mode === "open"
      ? isPayment(t) && youServices.has(t.to) && !releasedTo.has(t.from)
      : t.to === railAddr || t.from === railAddr)
    .map((t) => (t.from === railAddr ? t.to : t.from)))]
    .filter((a) => !yours.has(a))
    .sort();
  const crowd = new Set(crowdPool.slice(0, CROWD_NODES - (yours.size - owned.size)));
  const crowdTransfers = ledger.transfers.filter((t) => (crowd.has(t.from) && (isPayment(t) || t.to === railAddr)) || (t.from === railAddr && crowd.has(t.to)));

  const edges = new Map<string, { source: Address; target: Address; n: number; usdc: number }>();
  for (const t of [...mine, ...crowdTransfers]) {
    const key = `${t.from}>${t.to}`;
    const e = edges.get(key) ?? { source: t.from, target: t.to, n: 0, usdc: 0 };
    e.n += 1;
    e.usdc += t.amount;
    edges.set(key, e);
  }
  const ids = new Set([...edges.values()].flatMap((e) => [e.source, e.target]));

  const agentNo = new Map(you.agents.map((a, i) => [a, i + 1]));
  const nodes: GraphView["nodes"] = [...ids].sort().map((id) => {
    const w = info.get(id)!;
    const oneTime = releasedTo.has(id);
    const label = w.label || (id === you.personal ? "Your wallet" : owned.has(id) ? `Your agent ${agentNo.get(id)}` : short(id));
    return { id, label, kind: oneTime ? "one-time" : w.kind, owned: owned.has(id) };
  });

  return {
    nodes,
    edges: [
      ...[...edges.values()].map((e) => ({
        source: e.source,
        target: e.target,
        type: "TRANSFER" as const,
        label: e.n === 1 ? `${round6(e.usdc)} USDC` : `${e.n} payments · ${round6(e.usdc)} USDC`,
      })),
      ...p.links.map((l) => ({ source: l.a, target: l.b, type: "SAME_OWNER" as const, label: l.detail })),
    ],
  };
}

mkdirSync(OUT, { recursive: true });
const write = (name: string, data: unknown) => writeFileSync(join(OUT, name), JSON.stringify(data, null, name.startsWith("ledger") ? 0 : 2) + "\n");

const open = simulate(SEED, "open");
const shield = simulate(SEED, "shield");
const profileOpen = profile(open, "open");
const profileShield = profile(shield, "shield");

write("ledger.seed42.json", open.ledger);
write("ledger.seed42.shield.json", shield.ledger);
write("truth.seed42.json", open.truth);
write("truth.seed42.shield.json", shield.truth);
write("profile.open.json", profileOpen);
write("profile.shield.json", profileShield);
write("graph.open.json", graph(open, profileOpen));
write("graph.shield.json", graph(shield, profileShield));
console.log(`fixtures written to ${OUT}`);
