// Run the GSQL link queries and map results to the CONTRACTS.md types.
import { coactivityDetail, fundingDetail, type Address, type Ledger, type Mode, type SameOwnerLink } from "@glasshouse/engine";
import { TgError, type TgClient } from "./client";
import { toPayloads, vid } from "./load";

interface FundingRow { a: Address; b: Address; n: number; micro: number }
interface CoactivityRow { a: Address; b: Address; days: number }

function rows<T>(results: unknown[], key: string, query: string): T[] {
  const first = results[0] as Record<string, unknown> | undefined;
  const list = first?.[key];
  if (!Array.isArray(list)) throw new TgError(`${query}: expected results[0].${key} to be an array`);
  return list as T[];
}

export async function tgLinks(client: TgClient, ledger: Ledger, mode: Mode): Promise<SameOwnerLink[]> {
  const span = ledger.days * 86_400;
  const [funding, coactivity] = await Promise.all([
    client.runQuery("link_funding", { mode }),
    client.runQuery("link_coactivity", { mode, span }),
  ]);
  return [
    ...rows<FundingRow>(funding, "links", "link_funding")
      .map((r): SameOwnerLink => ({ a: r.a, b: r.b, rule: "funding", detail: fundingDetail(r.n, r.micro) })),
    ...rows<CoactivityRow>(coactivity, "links", "link_coactivity")
      .map((r): SameOwnerLink => ({ a: r.a, b: r.b, rule: "co-activity", detail: coactivityDetail(r.days) })),
  ];
}

// Writes SAME_OWNER edges so owner_profile (and TigerGraph's own explorer) can walk them.
export async function writeSameOwner(client: TgClient, mode: Mode, links: SameOwnerLink[]): Promise<void> {
  const edges = links.map((l) => ({
    srcType: "Wallet", src: vid(mode, l.a), edge: "SAME_OWNER", tgtType: "Wallet", tgt: vid(mode, l.b),
    attrs: { rule: l.rule, detail: l.detail },
  }));
  for (const p of toPayloads({ vertices: [], edges })) await client.upsert(p);
}

export async function tgMembers(client: TgClient, mode: Mode, seed: Address): Promise<Address[]> {
  const results = await client.runQuery("owner_profile", { seed: vid(mode, seed) });
  return rows<Address>(results, "members", "owner_profile");
}

// Order- and orientation-free form of a link list, for parity checks.
export function normalizeLinks(links: SameOwnerLink[]): string[] {
  return links.map((l) => {
    const [lo, hi] = l.a < l.b ? [l.a, l.b] : [l.b, l.a];
    return `${l.rule}|${lo}|${hi}|${l.detail}`;
  }).sort();
}
