"use client";
// Live sample of real agent wallets (POST /api/live/real): while anyone has this open, the server analyses one more
// real payer every 2 minutes and the totals grow here. Totals only; no wallet is ever named or stored.
import { useEffect, useState } from "react";

interface Totals {
  wallets: number; time_zone: number; exchange: number; linked: number; signal: number; around_the_clock: number;
  payments: number[]; by_time_zone: Record<string, number>; by_signal: Record<string, number>; updated_at: string | null;
}

export function useLiveReal(): { totals: Totals | null; justAdded: boolean } {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [justAdded, setJustAdded] = useState(false);
  useEffect(() => {
    let alive = true;
    const tick = () =>
      fetch("/api/live/real", { method: "POST" })
        .then(async (r) => ({ added: r.headers.get("x-glasshouse-sampled") === "true", body: (await r.json()) as Totals }))
        .then(({ added, body }) => {
          if (!alive || typeof body.wallets !== "number") return;
          setTotals(body);
          setJustAdded(added);
        })
        .catch(() => undefined);
    tick();
    const id = setInterval(tick, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return { totals, justAdded };
}

const pct = (k: number, n: number) => (n ? `${Math.round((k / n) * 100)}%` : "–");
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : 0);

export function LiveReal() {
  const { totals: t, justAdded } = useLiveReal();
  return (
    <section className="rounded-2xl border-2 border-exposed bg-surface p-5 sm:p-6" aria-live="polite" data-testid="live-real">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <span className="inline-block size-2.5 animate-pulse rounded-full bg-exposed" />
          Live sample, growing while you watch
        </h2>
        <p className="text-base text-ink-2">
          {t && t.wallets > 0 ? <><strong className="tabular text-ink">{t.wallets}</strong> real wallets so far{justAdded ? " · one just added" : ""}</> : "Analysing the first real wallet…"}
        </p>
      </div>
      {t && t.wallets > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {([
            [pct(t.time_zone, t.wallets), "give away a time zone"],
            [pct(t.exchange, t.wallets), "funded from an exchange-like wallet"],
            [pct(t.linked, t.wallets), "topped up by another private wallet"],
            [pct(t.signal, t.wallets), "show a life signal"],
            [pct(t.around_the_clock, t.wallets), "pay around the clock"],
            [String(median(t.payments)), "paid calls a day, typical"],
          ] as const).map(([v, l]) => (
            <div key={l}>
              <dt className="text-base text-ink-2">{l}</dt>
              <dd className="tabular text-3xl font-black text-exposed">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-4 text-sm text-ink-2">
        Every 2 minutes, one more x402 payer from the latest Base blocks is analysed in memory and only these totals are kept.
      </p>
    </section>
  );
}
