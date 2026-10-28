"use client";
// Gate 3: a real Shield session on Base Sepolia: a fresh one-time wallet funded through the rail, and (if
// configured) one x402 payment from it. Shows the transaction hashes with explorer links.
import { useState } from "react";

const scan = (tx: string) => `https://sepolia.basescan.org/tx/${tx}`;
type Session = { wallet: string; funded_tx: string; payment_tx?: string };

function Tx({ label, tx }: { label: string; tx: string }) {
  return (
    <p className="text-base">
      {label}:{" "}
      <a href={scan(tx)} target="_blank" rel="noreferrer" data-testid="shield-tx" className="break-all font-mono text-accent underline underline-offset-2">{tx}</a>
    </p>
  );
}

export function ShieldSession() {
  const [state, setState] = useState<{ s: "idle" | "busy" } | { s: "done"; data: Session } | { s: "error"; message: string }>({ s: "idle" });
  return (
    <section aria-labelledby="session-h" className="rounded-2xl border border-safe bg-surface p-5 sm:p-6">
      <h2 id="session-h" className="text-xl font-semibold">Try it for real (Base Sepolia testnet)</h2>
      <p className="mt-1 text-base text-ink-2">Creates a one-time wallet, funds it through the rail, and pays one x402 call from it.</p>
      <button disabled={state.s === "busy"} onClick={async () => {
        setState({ s: "busy" });
        try {
          const res = await fetch("/api/shield/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
          const out = await res.json();
          if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`);
          setState({ s: "done", data: out as Session });
        } catch (e) {
          setState({ s: "error", message: e instanceof Error ? e.message : String(e) });
        }
      }} className="mt-4 rounded-full bg-safe px-5 py-2.5 text-base font-semibold text-white disabled:opacity-60">
        {state.s === "busy" ? "Funding a one-time wallet…" : "Run a real Shield session"}
      </button>
      {state.s === "done" && (
        <div className="mt-4 space-y-1">
          <p className="text-base">One-time wallet: <span className="break-all font-mono">{state.data.wallet}</span></p>
          <Tx label="Funded through the rail" tx={state.data.funded_tx} />
          {state.data.payment_tx && <Tx label="x402 payment" tx={state.data.payment_tx} />}
        </div>
      )}
      {state.s === "error" && <p className="mt-3 text-base text-ink-2" role="status">Not available right now: {state.message}</p>}
    </section>
  );
}
