"use client";
import type { ProfileFacts } from "@glasshouse/engine";

const day = (ts: number) => new Date(ts * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const range = (a: number, b: number) => (day(a) === day(b) ? day(a) : `${day(a)} – ${day(b)}`);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line py-3 first:border-t-0 first:pt-0">
      <dt className="text-sm font-medium uppercase tracking-wide text-ink-2">{label}</dt>
      <dd className="mt-1 text-lg leading-snug text-ink">{children}</dd>
    </div>
  );
}

export function ProfilePanel({ p }: { p: ProfileFacts }) {
  const shield = p.linkability.traced === 0;
  // a real wallet with no agent payments: nothing to link, and no rail involved
  const nothingFound = p.source === "base-mainnet" && p.linkability.total === 0;
  return (
    <section aria-labelledby="profile-h" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 id="profile-h" className="text-xl font-semibold">What a stranger can work out about you</h2>
      {nothingFound ? (
        <div className="mt-4 rounded-xl bg-surface-2 p-4">
          <p className="text-2xl font-semibold">No agent payments found.</p>
          <p className="mt-1 text-lg text-ink-2">
            This wallet made no x402-style payments in the period we read, so there is nothing for a stranger to link.
            Audit again once your agent has been paying for a while.
          </p>
        </div>
      ) : shield ? (
        <div className="mt-4 rounded-xl bg-safe-soft p-4 text-safe">
          <p className="text-2xl font-semibold">Nothing that points to you.</p>
          <p className="mt-1 text-lg">
            {p.anonymity_set
              ? <>Each payment could belong to any of <strong className="tabular">{p.anonymity_set}</strong> people.</>
              : "Each payment blends into everyone else using the rail."}
          </p>
        </div>
      ) : (
        <dl className="mt-4">
          <Row label="Who you are">
            {p.identity_anchor
              ? <>Funded from <strong>{p.identity_anchor.exchange_label}</strong>, which likely knows your real name.</>
              : "No exchange ties these wallets to a name."}
          </Row>
          <Row label="Where you live">
            {p.timezone
              ? <>Likely <strong>{p.timezone.label}</strong>. You stop paying from {p.timezone.sleep_start_local} to {p.timezone.sleep_end_local}.</>
              : "Not enough payments to tell."}
          </Row>
          <Row label="What's going on in your life">
            {p.signals.length === 0 ? "No signals." : (
              <ul className="space-y-2">
                {p.signals.map((s) => (
                  <li key={s.category} className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span><strong>{s.text}</strong></span>
                    <span className="tabular text-base text-ink-2">{s.count} calls · {range(s.first_ts, s.last_ts)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Row>
          <Row label="Wallets linked to you">
            <span className="tabular">{p.wallets.length}</span> wallets, <span className="tabular">{p.links.length}</span> links between them
          </Row>
          <Row label="Total spend">
            <span className="tabular">{p.spend.payments}</span> payments · <span className="tabular">{p.spend.usdc.toFixed(2)}</span> USDC
          </Row>
        </dl>
      )}
    </section>
  );
}

// 48 half-hour bars on the person's local clock when we know it, UTC otherwise.
export function SleepStrip({ p }: { p: ProfileFacts }) {
  const offsetSlots = p.timezone ? Math.round(p.timezone.offset_minutes / 30) : 0;
  const local = Array.from({ length: 48 }, (_, i) => p.hourly[(i - offsetSlots + 48 * 2) % 48]!);
  const max = Math.max(1, ...local);
  const toSlot = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return (h! * 60 + m!) / 30;
  };
  const sleep = p.timezone ? [toSlot(p.timezone.sleep_start_local), toSlot(p.timezone.sleep_end_local)] as const : null;
  const asleep = (i: number) => sleep !== null && (sleep[0] <= sleep[1] ? i >= sleep[0] && i < sleep[1] : i >= sleep[0] || i < sleep[1]);
  const total = p.hourly.reduce((s, n) => s + n, 0);

  return (
    <section aria-labelledby="sleep-h" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="sleep-h" className="text-xl font-semibold">When your agents pay</h2>
        <p className="text-base text-ink-2">
          {sleep ? <>Quiet {p.timezone!.sleep_start_local}–{p.timezone!.sleep_end_local} local: that&apos;s when you sleep.</>
            : total === 0 ? "No traced payments: no daily rhythm to read." : "No clear sleep gap."}
        </p>
      </div>
      <div className="mt-4 flex h-28 items-end gap-[2px]" role="img"
        aria-label={sleep ? `Payments by half hour; none between ${p.timezone!.sleep_start_local} and ${p.timezone!.sleep_end_local}` : "Payments by half hour"}>
        {local.map((n, i) => (
          <div key={i} className={`relative h-full flex-1 rounded-sm ${asleep(i) ? "bg-surface-2" : ""}`}>
            <div className={`absolute bottom-0 w-full rounded-sm ${total === 0 ? "bg-line" : "bg-exposed"}`}
              style={{ height: `${total === 0 ? 4 : Math.max(n ? 6 : 0, (n / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-sm text-ink-2 tabular">
        {["00:00", "06:00", "12:00", "18:00", "24:00"].map((t) => <span key={t}>{t}</span>)}
      </div>
      <p className="mt-1 text-sm text-ink-2">{sleep ? "Your local time" : "UTC"}</p>
    </section>
  );
}

export function WriteUp({ text, shield }: { text: string | null; shield: boolean }) {
  return (
    <section aria-labelledby="ai-h" className={`rounded-2xl border p-5 sm:p-6 ${shield ? "border-safe bg-safe-soft" : "border-exposed bg-exposed-soft"}`}>
      <h2 id="ai-h" className="text-xl font-semibold">In plain English</h2>
      <p className="mt-3 text-lg leading-relaxed text-ink" aria-live="polite">
        {text === null ? <span className="text-ink-2">Writing it up…</span> : text || <span className="text-ink-2">Write-up unavailable right now.</span>}
      </p>
    </section>
  );
}
