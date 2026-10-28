import { agentPayments, coactivityDetail, linkCoactivity, linkFunding, fundingDetail, passesLift, simulate, COACTIVITY, type SameOwnerLink } from "@glasshouse/engine";
import { describe, expect, it } from "vitest";
import { normalizeLinks } from "../src/links";
import { BATCH_SIZE, toPayloads, toRecords, vid } from "../src/load";

const { ledger } = simulate(42, "open");
const records = toRecords(ledger, "open");

describe("toRecords", () => {
  it("one Wallet per address, one Payment per agent payment, two ACTIVE_IN per payment", () => {
    const pays = agentPayments(ledger);
    expect(records.vertices.filter((v) => v.type === "Wallet")).toHaveLength(ledger.wallets.length);
    expect(records.vertices.filter((v) => v.type === "Payment")).toHaveLength(pays.length);
    expect(records.edges.filter((e) => e.edge === "ACTIVE_IN")).toHaveLength(pays.length * 2);
    expect(records.vertices.every((v) => v.id.startsWith("open:"))).toBe(true);
  });

  it("TRANSFER edges aggregate per ordered pair and keep every micro-USDC", () => {
    const transfers = records.edges.filter((e) => e.edge === "TRANSFER");
    expect(transfers.reduce((s, e) => s + (e.attrs.n as number), 0)).toBe(ledger.transfers.length);
    const total = ledger.transfers.reduce((s, t) => s + Math.round(t.amount * 1e6), 0);
    expect(transfers.reduce((s, e) => s + (e.attrs.micro as number), 0)).toBe(total);
  });
});

describe("toPayloads", () => {
  const payloads = toPayloads(records);

  it("batches at most BATCH_SIZE records, vertices before edges", () => {
    const count = (p: (typeof payloads)[number]) =>
      p.vertices ? Object.values(p.vertices).reduce((s, byId) => s + Object.keys(byId).length, 0)
        : Object.values(p.edges!).flatMap((bySrc) => Object.values(bySrc)).flatMap((byEdge) => Object.values(byEdge))
          .flatMap((byType) => Object.values(byType)).reduce((s, byTgt) => s + Object.keys(byTgt).length, 0);
    expect(payloads.every((p) => count(p) <= BATCH_SIZE)).toBe(true);
    expect(payloads.map(count).reduce((a, b) => a + b, 0)).toBe(records.vertices.length + records.edges.length);
    const firstEdge = payloads.findIndex((p) => p.edges);
    expect(payloads.slice(firstEdge).every((p) => p.edges && !p.vertices)).toBe(true);
  });

  it("uses the documented upsert shape: type → id → attr → { value }", () => {
    const w = ledger.wallets[0]!;
    const wallets = payloads.find((p) => p.vertices?.Wallet?.[vid("open", w.addr)])!;
    expect(wallets.vertices!.Wallet![vid("open", w.addr)]).toEqual({
      addr: { value: w.addr }, mode: { value: "open" }, kind: { value: w.kind }, label: { value: w.label }, category: { value: w.category ?? "" },
    });
  });
});

// Re-runs the algorithms in queries/*.gsql over the records we upload, to check the graph
// design gives the engine's answers before a live TigerGraph is involved.
describe("GSQL algorithms over the uploaded graph == engine", () => {
  it("link_funding: unordered pairs of unlabelled wallets over TRANSFER", () => {
    const kind = new Map(records.vertices.filter((v) => v.type === "Wallet").map((v) => [v.id, v.attrs.kind]));
    const addr = (id: string) => id.slice("open:".length) as `0x${string}`;
    const pairs = new Map<string, { a: string; b: string; n: number; micro: number }>();
    for (const e of records.edges.filter((x) => x.edge === "TRANSFER")) {
      if (kind.get(e.src) !== "" || kind.get(e.tgt) !== "" || e.src === e.tgt) continue;
      const [a, b] = [addr(e.src), addr(e.tgt)].sort() as [string, string];
      const p = pairs.get(`${a}|${b}`) ?? { a, b, n: 0, micro: 0 };
      p.n += e.attrs.n as number;
      p.micro += e.attrs.micro as number;
      pairs.set(`${a}|${b}`, p);
    }
    const gsql = [...pairs.values()].map((p): SameOwnerLink =>
      ({ a: p.a as `0x${string}`, b: p.b as `0x${string}`, rule: "funding", detail: fundingDetail(p.n, p.micro) }));
    expect(normalizeLinks(gsql)).toEqual(normalizeLinks(linkFunding(ledger)));
  });

  it.each(["open", "shield"] as const)("link_coactivity (%s): pairs counted once in bucket max(home)", (mode) => {
    const l = simulate(42, mode).ledger;
    const recs = toRecords(l, mode);
    const pays = new Map(recs.vertices.filter((v) => v.type === "Payment").map((v) => [v.id, v.attrs]));
    const items = new Map<string, { wallet: string; ts: number; home: number }[]>();
    for (const e of recs.edges.filter((x) => x.edge === "ACTIVE_IN")) {
      const p = pays.get(e.src)!;
      const list = items.get(e.tgt) ?? [];
      list.push({ wallet: p.wallet as string, ts: p.ts as number, home: p.home as number });
      items.set(e.tgt, list);
    }
    const perWallet = new Map<string, number>();
    for (const p of pays.values()) perWallet.set(p.wallet as string, (perWallet.get(p.wallet as string) ?? 0) + 1);
    const groups = new Map<string, { observed: number; sessions: Set<number>; days: Set<number> }>();
    for (const [bucket, list] of items) {
      const k = Number(bucket.split(":")[1]);
      for (let i = 0; i < list.length - 1; i++) for (let j = i + 1; j < list.length; j++) {
        const x = list[i]!, y = list[j]!;
        if (x.wallet === y.wallet || Math.abs(x.ts - y.ts) > COACTIVITY.windowSec || (x.home !== k && y.home !== k)) continue;
        const key = [x.wallet, y.wallet].sort().join("|");
        const t = Math.min(x.ts, y.ts);
        const g = groups.get(key) ?? { observed: 0, sessions: new Set(), days: new Set() };
        g.observed += 1;
        g.sessions.add(t - (t % 600));
        g.days.add(t - (t % 86_400));
        groups.set(key, g);
      }
    }
    const gsql: SameOwnerLink[] = [];
    for (const [key, g] of groups) {
      const [a, b] = key.split("|") as [`0x${string}`, `0x${string}`];
      if (g.sessions.size >= 4 && g.days.size >= 3 && passesLift(g.observed, perWallet.get(a)!, perWallet.get(b)!, l.days * 86_400)) {
        gsql.push({ a, b, rule: "co-activity", detail: coactivityDetail(g.days.size) });
      }
    }
    expect(normalizeLinks(gsql)).toEqual(normalizeLinks(linkCoactivity(l)));
  });
});
