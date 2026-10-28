// Payments made from one-time wallets: unlabelled wallets whose only incoming funds came from a pool.
// Used to check real testnet exports (Gate 3) and by tooling; the linking rules never look at this.
import { agentPayments } from "./analyze";
import type { Address, Ledger, Transfer } from "./types";

export function oneTimePayments(ledger: Ledger): Transfer[] {
  const kind = new Map(ledger.wallets.map((w) => [w.addr, w.kind]));
  const funders = new Map<Address, Set<string>>();
  for (const t of ledger.transfers) {
    if (kind.get(t.to) !== "") continue;
    const set = funders.get(t.to) ?? new Set<string>();
    set.add(kind.get(t.from) ?? "unknown");
    funders.set(t.to, set);
  }
  const poolOnly = (w: Address) => {
    const f = funders.get(w);
    return f !== undefined && f.size === 1 && f.has("pool");
  };
  return agentPayments(ledger).filter((t) => poolOnly(t.from));
}
