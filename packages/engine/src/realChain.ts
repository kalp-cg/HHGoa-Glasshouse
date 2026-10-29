// Labels a single wallet's real-chain ledger before analysis (the chain gives no labels):
// - the wallets it paid are services; their category comes from the public x402 service list when known;
// - a funder that has sent 1,000+ transactions is an exchange or a service, not the person's own wallet, so it is
//   labelled as the likely exchange (the identity anchor) instead of being linked to them by the funding rule.
// Pure apart from the injected sendCount lookup.
import type { Address, Category, Ledger } from "./types";

export const HIGH_VOLUME_SENDS = 1000;
const MAX_FUNDERS_CHECKED = 20;

export interface RealChainLookups {
  serviceCategory: (addr: Address) => Category | null;
  sendCount: (addr: Address) => Promise<number>;
}

export async function labelRealChain(ledger: Ledger, address: Address, lookups: RealChainLookups): Promise<Ledger> {
  const me = address.toLowerCase() as Address;
  const sellers = new Set(ledger.transfers.filter((t) => t.from === me && t.to !== me).map((t) => t.to));
  const funders = [...new Set(ledger.transfers.filter((t) => t.to === me && t.from !== me && !sellers.has(t.from)).map((t) => t.from))]
    .slice(0, MAX_FUNDERS_CHECKED);
  const sends = await Promise.all(funders.map((a) => lookups.sendCount(a).catch(() => 0)));
  const exchanges = new Set(funders.filter((_, i) => sends[i]! >= HIGH_VOLUME_SENDS));
  return {
    ...ledger,
    wallets: ledger.wallets.map((w) => {
      if (sellers.has(w.addr)) {
        return { ...w, kind: "service", label: `x402 service ${w.addr.slice(0, 6)}…${w.addr.slice(-4)}`, category: lookups.serviceCategory(w.addr) };
      }
      if (exchanges.has(w.addr)) return { ...w, kind: "exchange", label: "a high-volume wallet (probably an exchange)", category: null };
      return w;
    }),
  };
}
