"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Graph } from "../_demo/Graph";
import { ProfilePanel } from "../_demo/Panels";
import { useDemoData } from "../_demo/data";
import { LivePulse } from "../_live/LivePulse";
import { LiveReal } from "../_live/LiveReal";

export interface Proof { funded_tx: string; funded_usdc: number; payment_tx: string; payment_usdc: number; at: number }
interface Props {
  qrSvg: string;
  auditUrl: string;
  proof: Proof | null;
  snapshot: { wallets: number; time_zone: number; linked: number; signal: number };
}

const scan = (tx: string) => `https://sepolia.basescan.org/tx/${tx}`;
const short = (tx: string) => `${tx.slice(0, 10)}…${tx.slice(-6)}`;

function Slide({ kicker, title, children }: { kicker: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <p className="text-base font-semibold uppercase tracking-widest text-ink-2">{kicker}</p>
      <h1 className="max-w-5xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">{title}</h1>
      {children}
    </div>
  );
}

export function Tour({ qrSvg, auditUrl, proof, snapshot }: Props) {
  const demo = useDemoData();
  const [i, setI] = useState(0);
  const open = demo.state === "ready" ? demo.data.open : undefined;
  const shield = demo.state === "ready" ? demo.data.shield : undefined;

  const slides: { id: string; body: ReactNode }[] = [
    { id: "start", body: (
      <Slide kicker="Glasshouse · Hacker House Goa" title={<>Your AI agent pays in public.<br /><span className="text-exposed">Anyone can read it.</span></>}>
        <p className="max-w-3xl text-2xl text-ink-2">A 3-minute look at what AI agents&apos; payments reveal about the people behind them, live on Base, and the one switch that hides it.</p>
      </Slide>
    ) },
    { id: "live", body: (
      <Slide kicker="1 · Right now" title="AI agents are paying for APIs on Base, every second">
        <LivePulse big />
        <p className="text-xl text-ink-2">That counter is reading the real chain as you watch. Every one of those payments stays public forever.</p>
      </Slide>
    ) },
    { id: "open", body: (
      <Slide kicker="2 · One person's agents (simulated)" title={<>A stranger can trace <span className="text-exposed">all {open?.profile.linkability.traced ?? 238}</span> of their payments</>}>
        {open ? (
          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <div className="rounded-2xl border border-line bg-surface p-4"><Graph graph={open.graph} mode="open" /></div>
            <ProfilePanel p={open.profile} />
          </div>
        ) : <p className="text-xl text-ink-2">Loading…</p>}
      </Slide>
    ) },
    { id: "shield", body: (
      <Slide kicker="3 · One switch: Shield mode" title={<>Same person, same payments. <span className="text-safe">0 of {shield?.profile.linkability.total ?? 238}</span> traced.</>}>
        {shield ? (
          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <div className="rounded-2xl border border-line bg-surface p-4"><Graph graph={shield.graph} mode="shield" /></div>
            <ProfilePanel p={shield.profile} />
          </div>
        ) : <p className="text-xl text-ink-2">Loading…</p>}
        <p className="text-xl text-ink-2">Each session pays from a fresh one-time wallet, funded through a shared rail. The same analysis finds nothing to link.</p>
      </Slide>
    ) },
    { id: "proof", body: (
      <Slide kicker="4 · Not a mock-up" title="It works on a real chain">
        {proof ? (
          <ol className="grid gap-4 text-xl sm:grid-cols-2">
            <li className="rounded-2xl border border-line bg-surface p-5">
              <p className="font-semibold">1. The Rail funds a brand-new one-time wallet</p>
              <p className="mt-1 text-ink-2">{proof.funded_usdc} test USDC on Base Sepolia</p>
              <a className="mt-3 inline-block font-mono text-lg text-accent underline" href={scan(proof.funded_tx)} target="_blank" rel="noreferrer" data-testid="tour-tx">{short(proof.funded_tx)}</a>
            </li>
            <li className="rounded-2xl border border-line bg-surface p-5">
              <p className="font-semibold">2. That wallet pays a real x402 service</p>
              <p className="mt-1 text-ink-2">{proof.payment_usdc} USDC, settled by the x402 facilitator</p>
              <a className="mt-3 inline-block font-mono text-lg text-accent underline" href={scan(proof.payment_tx)} target="_blank" rel="noreferrer" data-testid="tour-tx">{short(proof.payment_tx)}</a>
            </li>
          </ol>
        ) : <p className="text-xl text-ink-2">No testnet session recorded yet.</p>}
        <p className="text-xl text-ink-2">Run through our own analysis, those transactions link to nobody. TigerGraph does the linking; it agrees with our engine on every link.</p>
      </Slide>
    ) },
    { id: "real", body: (
      <Slide kicker="5 · Real agents, totals only" title="It's not just our test person">
        <p className="text-2xl text-ink-2">
          Of <strong className="text-ink">{snapshot.wallets}</strong> real agent wallets we sampled on Base, <strong className="text-exposed">{snapshot.time_zone}%</strong> give away their time zone
          and <strong className="text-exposed">{snapshot.linked}%</strong> were topped up by another private wallet.
        </p>
        <LiveReal />
        <p className="text-lg text-ink-2">No wallet is named, stored or shown: only totals.</p>
      </Slide>
    ) },
    { id: "you", body: (
      <Slide kicker="6 · Your turn" title="Check your own agent's wallet">
        <div className="flex flex-wrap items-center gap-8">
          <div className="w-56 shrink-0 rounded-2xl bg-white p-3" aria-label={`QR code for ${auditUrl}`} dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <div className="max-w-xl space-y-3 text-xl">
            <p>Scan with your phone&apos;s wallet browser, sign one free message, and see what your agent gives away.</p>
            <p className="text-ink-2">Only you see it. We never show anyone else&apos;s profile.</p>
            <p className="break-all font-mono text-lg text-accent">{auditUrl}</p>
          </div>
        </div>
      </Slide>
    ) },
  ];

  const go = useCallback((d: number) => setI((x) => Math.min(slides.length - 1, Math.max(0, x + d))), [slides.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <a href="/" className="text-2xl font-bold tracking-tight">Glass<span className="text-accent">house</span></a>
        <span className="tabular text-base text-ink-2" data-testid="tour-step">{i + 1} / {slides.length}</span>
      </header>
      <main className="flex flex-1 items-start px-4 py-6 sm:px-8 sm:py-10" aria-live="polite">{slides[i]!.body}</main>
      <footer className="sticky bottom-0 flex items-center justify-between gap-4 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:px-8">
        <button type="button" onClick={() => go(-1)} disabled={i === 0} className="rounded-full border border-line px-5 py-2.5 text-lg font-semibold disabled:opacity-40">← Back</button>
        <div className="flex gap-2" aria-hidden="true">
          {slides.map((s, k) => <span key={s.id} className={`size-2.5 rounded-full ${k === i ? "bg-accent" : "bg-line"}`} />)}
        </div>
        <button type="button" onClick={() => go(1)} disabled={i === slides.length - 1} className="rounded-full bg-accent px-5 py-2.5 text-lg font-semibold text-white disabled:opacity-40">Next →</button>
      </footer>
    </div>
  );
}
