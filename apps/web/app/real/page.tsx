// Real data, totals only: what a sample of real x402 agent wallets on Base give away (pnpm real:totals).
// Built from public chain data; no wallet is named, stored or shown.
import type { Metadata } from "next";
import totals from "../../../../fixtures/real-base-totals.json";
import { LivePulse } from "../_live/LivePulse";
import { LiveReal } from "../_live/LiveReal";

export const metadata: Metadata = {
  title: "Real agent payments on Base · Glasshouse",
  description: "What real AI agents' payments on Base give away. Totals only; no wallet is named.",
};

function Stat({ value, label, tone }: { value: string; label: string; tone?: "exposed" | "plain" }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className={`tabular text-5xl font-black ${tone === "plain" ? "text-ink" : "text-exposed"}`}>{value}</p>
      <p className="mt-2 text-lg text-ink-2">{label}</p>
    </div>
  );
}

function Bars({ data, total }: { data: Record<string, number>; total: number }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return <p className="text-lg text-ink-2">None in this sample.</p>;
  return (
    <ul className="space-y-3">
      {rows.map(([label, n]) => (
        <li key={label}>
          <div className="flex justify-between text-lg"><span>{label}</span><span className="tabular text-ink-2">{n} of {total}</span></div>
          <div className="mt-1 h-3 rounded-full bg-surface-2"><div className="h-3 rounded-full bg-exposed" style={{ width: `${Math.max(3, (n / total) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export default function RealPage() {
  const t = totals;
  const when = new Date(t.generated_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 py-5">
        <a href="/" className="text-2xl font-bold tracking-tight">Glass<span className="text-accent">house</span></a>
        <nav className="flex gap-5 text-base font-semibold text-ink-2">
          <a href="/" className="underline-offset-4 hover:underline">Demo</a>
          <a href="/audit" className="underline-offset-4 hover:underline">Audit your agent</a>
        </nav>
      </header>

      <section className="py-8 sm:py-12">
        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">What real AI agents on Base give away</h1>
        <p className="mt-4 max-w-2xl text-xl text-ink-2">
          We sampled <strong className="tabular text-ink">{t.wallets_analysed}</strong> real agent wallets paying with x402 in the {t.window} and ran
          the same analysis as the demo. Totals only: no wallet is named, stored or shown.
        </p>
      </section>

      <div className="mb-6 grid gap-6">
        <LivePulse />
        <LiveReal />
      </div>

      <h2 className="mb-3 text-2xl font-semibold">Snapshot: {t.wallets_analysed} wallets from {t.window}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat value={`${t.give_away_time_zone_pct}%`} label="give away their time zone from when payments stop at night" />
        <Stat value={`${t.funded_from_exchange_like_wallet_pct}%`} label="were funded straight from an exchange-like wallet, which likely knows the owner" />
        <Stat value={`${t.linked_to_another_wallet_pct}%`} label="were topped up by another private wallet, which the funding rule treats as the same owner" />
        <Stat value={`${t.show_a_life_signal_pct}%`} label="show what they are working on (a life signal)" />
        <Stat value={`${t.run_around_the_clock_pct}%`} label="pay around the clock, like a machine with no sleep gap" tone="plain" />
        <Stat value={String(t.median_payments_per_day)} label="paid calls per day for a typical wallet" tone="plain" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-xl font-semibold">What they pay for</h2>
          <p className="mt-1 mb-4 text-base text-ink-2">Wallets with a life signal, by category (from Coinbase&apos;s public x402 service list).</p>
          <Bars data={t.wallets_by_signal} total={t.wallets_analysed} />
        </section>
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Where they likely live</h2>
          <p className="mt-1 mb-4 text-base text-ink-2">Wallets whose sleep gap gives away a time zone (groups under 3 merged into &quot;other&quot;).</p>
          <Bars data={t.wallets_by_time_zone} total={t.wallets_analysed} />
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-line bg-surface-2 p-5 text-base text-ink-2 sm:p-6">
        <h2 className="text-lg font-semibold text-ink">How this was measured</h2>
        <p className="mt-2">{t.method}. {t.payers_seen} distinct payers were seen; {t.wallets_analysed} were analysed. Snapshot taken {when} UTC.</p>
        <p className="mt-2">Want your own wallet&apos;s result? <a href="/audit" className="font-semibold text-accent underline underline-offset-2">Audit it</a>: you sign, you see it, nobody else does.</p>
      </section>
    </div>
  );
}
