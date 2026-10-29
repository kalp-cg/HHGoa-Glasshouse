"use client";
import { useState } from "react";
import { Graph } from "./Graph";
import { ShieldSession } from "./ShieldSession";
import { ProfilePanel, SleepStrip, WriteUp } from "./Panels";
import { useDemoData, useNarrative, type Mode } from "./data";

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const options: { value: Mode; label: string }[] = [
    { value: "open", label: "Pays openly" },
    { value: "shield", label: "Shield mode" },
  ];
  return (
    <div role="group" aria-label="Payment mode" className="inline-flex rounded-full border border-line bg-surface p-1 shadow-sm">
      {options.map((o) => {
        const on = mode === o.value;
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(o.value)}
            className={`rounded-full px-5 py-2.5 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-7 sm:text-lg ${
              on ? (o.value === "open" ? "bg-exposed text-white" : "bg-safe text-white") : "text-ink-2 hover:text-ink"}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Hero({ traced, total, shield }: { traced: number; total: number; shield: boolean }) {
  return (
    <section className="py-8 sm:py-12" aria-live="polite">
      <p className="max-w-3xl text-xl text-ink-2 sm:text-2xl">
        Your AI agents made <strong className="tabular text-ink">{total}</strong> paid API calls in the last 10 days.
      </p>
      <h1 className="mt-3 max-w-4xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
        Anyone can trace{" "}
        <span className={shield ? "text-safe" : "text-exposed"}>{shield ? "none of them" : `all ${traced}`}</span> to you.
      </h1>
      <p data-testid="traced" className={`tabular mt-6 text-6xl font-black tracking-tight sm:text-8xl ${shield ? "text-safe" : "text-exposed"}`}>
        {traced} <span className="text-3xl font-semibold text-ink-2 sm:text-4xl">of {total} traced</span>
      </p>
    </section>
  );
}

export function Demo() {
  const load = useDemoData();
  const [mode, setMode] = useState<Mode>("open");
  const current = load.state === "ready" ? load.data[mode] : undefined;
  const narrative = useNarrative(current?.profile);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 py-5">
        <a href="/" className="text-2xl font-bold tracking-tight">Glass<span className="text-accent">house</span></a>
        <div className="flex flex-wrap items-center gap-4">
          <a href="/audit" className="text-base font-semibold text-accent underline-offset-4 hover:underline">Audit your agent</a>
          <ModeSwitch mode={mode} onChange={setMode} />
        </div>
      </header>

      {load.state === "loading" && (
        <div className="py-24 text-center text-xl text-ink-2" role="status">Reading the public ledger…</div>
      )}
      {load.state === "error" && (
        <div className="my-16 rounded-2xl border border-exposed bg-exposed-soft p-6 text-lg" role="alert">
          <p className="font-semibold">Couldn&apos;t load the analysis: {load.message}</p>
          <p className="mt-2"><a className="underline" href="/?fixtures=1">Show the saved demo data instead</a></p>
        </div>
      )}
      {current && (
        <>
          <Hero traced={current.profile.linkability.traced} total={current.profile.linkability.total} shield={mode === "shield"} />
          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <section aria-labelledby="graph-h" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <h2 id="graph-h" className="text-xl font-semibold">
                {mode === "open" ? "Every wallet that is you, linked" : "One-time wallets in a crowd"}
              </h2>
              <p className="mt-1 text-base text-ink-2">
                {mode === "open"
                  ? "Your personal wallet and three agents, tied together by top-ups and by paying at the same moments."
                  : "Each session paid from a fresh wallet funded by the shared rail. Nothing links them to you."}
              </p>
              <div className="mt-4"><Graph graph={current.graph} mode={mode} /></div>
            </section>
            <ProfilePanel p={current.profile} />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <SleepStrip p={current.profile} />
            <WriteUp text={narrative} shield={mode === "shield"} />
          </div>
          {mode === "shield" && <div className="mt-6"><ShieldSession /></div>}
          <footer className="mt-10 text-base text-ink-2">
            Synthetic demo data (seed 42){load.state === "ready" && load.source === "fixtures" ? " · saved copy" : ""}.
            Glasshouse never shows a real person&apos;s profile.
          </footer>
        </>
      )}
    </div>
  );
}
