// The synthetic world behind /api/graph and /api/profile, and where its links come from:
// TigerGraph when configured, the engine when OFFLINE_MODE=true or TigerGraph fails.
import { analyze, graphView, profile, simulate, type Address, type GraphView, type Ledger, type Mode, type ProfileFacts, type SameOwnerLink } from "@glasshouse/engine";
import { configFromEnv, createClient, tgLinks } from "@glasshouse/tigergraph";
import { offlineMode } from "./env";
import { HttpError } from "./http";

const SEED = 42;

interface World {
  ledger: Ledger;
  person: Address;          // the demo person's personal wallet (fixtures/profile.open.json seed_wallet)
  sessionWallets: Address[]; // their own Shield one-time wallets, known from their session
}

const worlds = new Map<Mode, World>();
function world(mode: Mode): World {
  let w = worlds.get(mode);
  if (!w) {
    const sim = simulate(SEED, mode);
    w = { ledger: sim.ledger, person: sim.you.personal, sessionWallets: mode === "shield" ? sim.you.agents : [] };
    worlds.set(mode, w);
  }
  return w;
}

export type LinkSource = "tigergraph" | "engine";
const tgCache = new Map<Mode, SameOwnerLink[]>();

async function links(mode: Mode, ledger: Ledger): Promise<{ links: SameOwnerLink[]; source: LinkSource }> {
  const cfg = configFromEnv();
  if (offlineMode() || !cfg) return { links: analyze(ledger), source: "engine" };
  const cached = tgCache.get(mode);
  if (cached) return { links: cached, source: "tigergraph" };
  try {
    const found = await tgLinks(createClient({ ...cfg, timeoutMs: 8_000 }), ledger, mode);
    tgCache.set(mode, found);
    return { links: found, source: "tigergraph" };
  } catch (err) {
    console.warn(`TigerGraph unavailable, using the engine: ${err instanceof Error ? err.message : String(err)}`);
    return { links: analyze(ledger), source: "engine" };
  }
}

export async function profileFor(wallet: Address, mode: Mode): Promise<{ facts: ProfileFacts; source: LinkSource; own: Address[] }> {
  const w = world(mode);
  if (!w.ledger.wallets.some((x) => x.addr === wallet && x.kind === "")) {
    throw new HttpError(404, "wallet not found in the synthetic ledger");
  }
  const { links: found, source } = await links(mode, w.ledger);
  const own = wallet === w.person ? w.sessionWallets : [];
  return { facts: profile(w.ledger, found, wallet, { mode, ownWallets: own }), source, own };
}

export async function graphFor(wallet: Address, mode: Mode): Promise<{ graph: GraphView; source: LinkSource }> {
  const { facts, source, own } = await profileFor(wallet, mode);
  return { graph: graphView(world(mode).ledger, facts, own), source };
}
