// Ledger → TigerGraph upsert payloads (schema.gsql). Ids are "<mode>:<key>".
import { agentPayments, COACTIVITY, toMicro, type Ledger, type Mode } from "@glasshouse/engine";
import type { TgClient } from "./client";

export const BATCH_SIZE = 2000; // records per upsert request
export const BUCKET_SEC = COACTIVITY.windowSec;

type Attrs = Record<string, string | number>;
type VertexRecord = { type: "Wallet" | "Payment" | "Bucket"; id: string; attrs: Attrs };
type EdgeRecord = { srcType: string; src: string; edge: string; tgtType: string; tgt: string; attrs: Attrs };

export interface UpsertPayload {
  vertices?: Record<string, Record<string, Record<string, { value: string | number }>>>;
  edges?: Record<string, Record<string, Record<string, Record<string, Record<string, Record<string, { value: string | number }>>>>>>;
}

export const vid = (mode: Mode, key: string | number) => `${mode}:${key}`;

const wrap = (attrs: Attrs) => Object.fromEntries(Object.entries(attrs).map(([k, value]) => [k, { value }]));

export function toRecords(ledger: Ledger, mode: Mode): { vertices: VertexRecord[]; edges: EdgeRecord[] } {
  const vertices: VertexRecord[] = ledger.wallets.map((w) => ({
    type: "Wallet",
    id: vid(mode, w.addr),
    attrs: { addr: w.addr, mode, kind: w.kind, label: w.label, category: w.category ?? "" },
  }));
  const edges: EdgeRecord[] = [];

  const transfers = new Map<string, { from: string; to: string; n: number; micro: number; first_ts: number }>();
  for (const t of ledger.transfers) {
    const key = `${t.from}>${t.to}`;
    const agg = transfers.get(key) ?? { from: t.from, to: t.to, n: 0, micro: 0, first_ts: t.ts };
    agg.n += 1;
    agg.micro += toMicro(t.amount);
    agg.first_ts = Math.min(agg.first_ts, t.ts);
    transfers.set(key, agg);
  }
  for (const t of transfers.values()) {
    edges.push({ srcType: "Wallet", src: vid(mode, t.from), edge: "TRANSFER", tgtType: "Wallet", tgt: vid(mode, t.to),
      attrs: { n: t.n, micro: t.micro, first_ts: t.first_ts } });
  }

  const buckets = new Set<number>();
  for (const p of agentPayments(ledger)) {
    const home = Math.floor(p.ts / BUCKET_SEC);
    const id = vid(mode, p.tx);
    vertices.push({ type: "Payment", id, attrs: { mode, wallet: p.from, service: p.to, micro: toMicro(p.amount), ts: p.ts, home } });
    for (const k of [home, home + 1]) {
      buckets.add(k);
      edges.push({ srcType: "Payment", src: id, edge: "ACTIVE_IN", tgtType: "Bucket", tgt: vid(mode, k), attrs: {} });
    }
  }
  for (const k of buckets) vertices.push({ type: "Bucket", id: vid(mode, k), attrs: { mode, k } });
  return { vertices, edges };
}

// Vertices first, then edges, at most `size` records per payload.
export function toPayloads(records: { vertices: VertexRecord[]; edges: EdgeRecord[] }, size = BATCH_SIZE): UpsertPayload[] {
  const payloads: UpsertPayload[] = [];
  for (let i = 0; i < records.vertices.length; i += size) {
    const vertices: NonNullable<UpsertPayload["vertices"]> = {};
    for (const v of records.vertices.slice(i, i + size)) (vertices[v.type] ??= {})[v.id] = wrap(v.attrs);
    payloads.push({ vertices });
  }
  for (let i = 0; i < records.edges.length; i += size) {
    const edges: NonNullable<UpsertPayload["edges"]> = {};
    for (const e of records.edges.slice(i, i + size)) {
      ((((edges[e.srcType] ??= {})[e.src] ??= {})[e.edge] ??= {})[e.tgtType] ??= {})[e.tgt] = wrap(e.attrs);
    }
    payloads.push({ edges });
  }
  return payloads;
}

export async function loadLedger(client: TgClient, ledger: Ledger, mode: Mode): Promise<number> {
  const payloads = toPayloads(toRecords(ledger, mode));
  for (const p of payloads) await client.upsert(p);
  return payloads.length;
}
