// GraphView for a profile's neighbourhood: the linked wallets, what they touched, and a crowd
// around them (payers of the same services in open mode, rail users in shield mode).
import { agentPayments } from "./analyze";
import type { Address, GraphView, Ledger, ProfileFacts } from "./types";

export const CROWD_NODES = 200; // keeps the view under ~300 nodes

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const short = (a: Address) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// ownWallets: the owner's own unlinked wallets (shield one-time wallets). They are drawn,
// but not marked owned, because nothing links them.
export function graphView(ledger: Ledger, facts: ProfileFacts, ownWallets: Address[] = []): GraphView {
  const info = new Map(ledger.wallets.map((w) => [w.addr, w]));
  const pays = new Set(agentPayments(ledger));
  const rail = ledger.wallets.find((w) => w.kind === "pool")?.addr;
  const releasedTo = new Set(ledger.transfers.filter((t) => t.from === rail).map((t) => t.to));

  const owned = new Set(facts.wallets.map((w) => w.addr));
  const yours = new Set([...owned, ...ownWallets]);
  const mine = ledger.transfers.filter((t) => yours.has(t.from) || yours.has(t.to));
  const yourServices = new Set(mine.filter((t) => pays.has(t)).map((t) => t.to));

  const crowdPool = [...new Set(ledger.transfers
    .filter((t) => facts.mode === "open"
      ? pays.has(t) && yourServices.has(t.to) && !releasedTo.has(t.from)
      : t.to === rail || t.from === rail)
    .map((t) => (t.from === rail ? t.to : t.from)))]
    .filter((a) => !yours.has(a))
    .sort();
  const crowd = new Set(crowdPool.slice(0, Math.max(0, CROWD_NODES - ownWallets.length)));
  const crowdTransfers = ledger.transfers.filter((t) =>
    (crowd.has(t.from) && (pays.has(t) || t.to === rail)) || (t.from === rail && crowd.has(t.to)));

  const edges = new Map<string, { source: Address; target: Address; n: number; usdc: number }>();
  for (const t of [...mine, ...crowdTransfers]) {
    const key = `${t.from}>${t.to}`;
    const e = edges.get(key) ?? { source: t.from, target: t.to, n: 0, usdc: 0 };
    e.n += 1;
    e.usdc += t.amount;
    edges.set(key, e);
  }
  const ids = new Set([...edges.values()].flatMap((e) => [e.source, e.target]));
  for (const a of owned) ids.add(a);

  const agents = facts.wallets.filter((w) => w.role !== "personal").map((w) => w.addr);
  const label = (id: Address) => {
    const w = info.get(id);
    if (w?.label) return w.label;
    if (id === facts.seed_wallet) return "Your wallet";
    if (agents.includes(id)) return `Your agent ${agents.indexOf(id) + 1}`;
    return owned.has(id) ? "Your wallet" : short(id);
  };

  return {
    nodes: [...ids].sort().map((id) => ({
      id,
      label: label(id),
      kind: releasedTo.has(id) ? "one-time" : (info.get(id)?.kind ?? ""),
      owned: owned.has(id),
    })),
    edges: [
      ...[...edges.values()].map((e) => ({
        source: e.source,
        target: e.target,
        type: "TRANSFER" as const,
        label: e.n === 1 ? `${round6(e.usdc)} USDC` : `${e.n} payments · ${round6(e.usdc)} USDC`,
      })),
      ...facts.links.map((l) => ({ source: l.a, target: l.b, type: "SAME_OWNER" as const, label: l.detail })),
    ],
  };
}
