// `pnpm real:services`: builds fixtures/x402-services.base.json, a map from x402 service pay-to address (Base mainnet)
// to a life-signal category, from Coinbase's public x402 discovery list ("Bazaar"). Public data about services only:
// no payer appears in it. Categories come from the service's own description; anything unclear stays unlabelled.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { categorize } from "../packages/engine/src/categorize";

const BAZAAR = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources"; // public, no key
const BASE = "eip155:8453";
const PAGES = Number(process.env.BAZAAR_PAGES ?? 40); // spread evenly over the whole list
const PAGE = 100;

interface Item { description?: string; accepts?: { network?: string; payTo?: string }[] }
async function page(offset: number): Promise<{ items: Item[]; total: number }> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${BAZAAR}?limit=${PAGE}&offset=${offset}`, { signal: AbortSignal.timeout(30_000) });
    if (res.ok) {
      const body = (await res.json()) as { items?: Item[]; pagination?: { total?: number } };
      return { items: body.items ?? [], total: body.pagination?.total ?? 0 };
    }
    if (attempt >= 4) throw new Error(`Bazaar HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

const first = await page(0);
const step = Math.max(PAGE, Math.floor(first.total / PAGES / PAGE) * PAGE);
const descriptions = new Map<string, string[]>();
let scanned = 0;
for (let offset = 0, n = 0; n < PAGES && offset < first.total; offset += step, n++) {
  const { items } = offset === 0 ? first : await page(offset);
  scanned += items.length;
  for (const it of items) {
    for (const a of it.accepts ?? []) {
      if (a.network !== BASE || !a.payTo || !it.description) continue;
      const key = a.payTo.toLowerCase();
      descriptions.set(key, [...(descriptions.get(key) ?? []), it.description]);
    }
  }
}

const services: Record<string, string> = {};
for (const [payTo, descs] of descriptions) {
  const c = categorize(descs.join(" "));
  if (c) services[payTo] = c;
}
const out = { source: BAZAAR, generated_at: new Date().toISOString(), scanned_resources: scanned, base_pay_to_seen: descriptions.size, services };
writeFileSync(join(import.meta.dirname, "../fixtures/x402-services.base.json"), JSON.stringify(out, null, 1) + "\n");
const counts: Record<string, number> = {};
for (const c of Object.values(services)) counts[c] = (counts[c] ?? 0) + 1;
console.log(`scanned ${scanned} of ${first.total} listings; ${descriptions.size} Base pay-to addresses; categorized ${Object.keys(services).length}:`, counts);
