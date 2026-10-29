"use client";
// Live: x402-style payments on Base right now (from /api/live/pulse, real chain, totals only).
// Polls every 20 s while the page is open and draws the readings it has seen since.
import { useEffect, useRef, useState } from "react";

interface Pulse { block: number; payments: number; payers: number; per_minute: number; at: string }

export function useLivePulse(): { now: Pulse | null; history: number[]; error: boolean } {
  const [now, setNow] = useState<Pulse | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [error, setError] = useState(false);
  const lastBlock = useRef(0);
  useEffect(() => {
    let alive = true;
    const tick = () =>
      fetch("/api/live/pulse")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((p: Pulse) => {
          if (!alive) return;
          setNow(p);
          setError(false);
          if (p.block !== lastBlock.current) setHistory((h) => [...h, p.per_minute].slice(-30)); // a new reading, not a cached repeat
          lastBlock.current = p.block;
        })
        .catch(() => alive && setError(true));
    tick();
    const id = setInterval(tick, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return { now, history, error };
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1), w = 120, h = 32;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="text-exposed">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function LivePulse({ big = false }: { big?: boolean }) {
  const { now, history, error } = useLivePulse();
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6" aria-live="polite" data-testid="live-pulse">
      <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-2">
        <span className={`inline-block size-2.5 rounded-full ${error ? "bg-crowd" : "animate-pulse bg-exposed"}`} />
        {error ? "Live feed paused" : "Live on Base mainnet"}
      </p>
      {now ? (
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <p className={`tabular font-black text-ink ${big ? "text-6xl sm:text-8xl" : "text-5xl"}`}>
            ~{now.per_minute}
            <span className={`ml-2 font-semibold text-ink-2 ${big ? "text-2xl sm:text-3xl" : "text-xl"}`}>agent payments a minute</span>
          </p>
          <Sparkline values={history} />
        </div>
      ) : (
        <p className="mt-2 text-xl text-ink-2">{error ? "Couldn't reach Base right now." : "Reading the latest blocks…"}</p>
      )}
      {now && (
        <p className="mt-2 text-base text-ink-2">
          <strong className="tabular text-ink">{now.payments}</strong> x402-style payments from <strong className="tabular text-ink">{now.payers}</strong> different
          wallets in the last 20 seconds (block {now.block.toLocaleString("en-US")}). Every one of them is public.
        </p>
      )}
    </div>
  );
}
