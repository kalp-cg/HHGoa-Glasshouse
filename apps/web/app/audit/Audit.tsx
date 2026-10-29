"use client";
// Self-audit: connect the browser's wallet (EIP-1193, via viem: https://viem.sh/docs/clients/transports/custom),
// sign the challenge, see what this wallet's own payments reveal. Only the owner of a wallet can audit it.
import { useEffect, useState } from "react";
import { createWalletClient, custom, type EIP1193Provider } from "viem";
import type { ProfileFacts } from "@glasshouse/engine";
import { ProfilePanel, SleepStrip } from "../_demo/Panels";
import { Alerts } from "./Alerts";
import { ServerSign } from "./ServerSign";
import { useInjectedWallets } from "./wallets";

declare global {
  interface Window { ethereum?: EIP1193Provider }
}

type Step =
  | { s: "idle" } | { s: "connecting" } | { s: "signing"; address: string } | { s: "reading"; address: string }
  | { s: "done"; address: string; facts: ProfileFacts } | { s: "error"; message: string };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((out as { error?: string }).error ?? `HTTP ${res.status}`);
  return out as T;
}

function Counter() {
  const [n, setN] = useState<{ audits: number; leaking_timezone: number } | null>(null);
  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then(setN).catch(() => setN(null));
  }, []);
  if (!n) return null;
  return (
    <p className="text-lg text-ink-2" data-testid="counter">
      <strong className="tabular text-ink">{n.audits}</strong> agent wallets audited at Hacker House Goa
      {n.audits > 0 && <> · <strong className="tabular text-ink">{n.leaking_timezone}</strong> gave away their time zone</>}
    </p>
  );
}

function ProButton() {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <button onClick={async () => {
        setMsg(null);
        try {
          window.location.href = (await postJson<{ url: string }>("/api/checkout", { plan: "pro-audit" })).url;
        } catch (e) {
          setMsg(e instanceof Error ? e.message : String(e));
        }
      }} className="rounded-full border-2 border-ink px-5 py-2.5 text-base font-semibold hover:bg-ink hover:text-bg">
        Get the pro audit
      </button>
      {msg && <p className="mt-2 text-base text-ink-2" role="status">{msg}</p>}
    </div>
  );
}

export function Audit() {
  const [step, setStep] = useState<Step>({ s: "idle" });
  const wallets = useInjectedWallets();

  async function run(provider: EIP1193Provider | undefined = window.ethereum) {
    try {
      if (!provider) throw new Error("No wallet found in this browser. Open this page in MetaMask or Coinbase Wallet, install a wallet extension, or sign from your server below.");
      setStep({ s: "connecting" });
      const wallet = createWalletClient({ transport: custom(provider) });
      const [address] = await wallet.requestAddresses();
      if (!address) throw new Error("The wallet didn't share an address.");
      const c = await postJson<{ message: string; nonce: string }>("/api/audit/challenge", { address });
      setStep({ s: "signing", address });
      const signature = await wallet.signMessage({ account: address, message: c.message });
      setStep({ s: "reading", address });
      const facts = await postJson<ProfileFacts>("/api/audit", { address, signature, nonce: c.nonce });
      setStep({ s: "done", address, facts });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setStep({ s: "error", message: /reject|denied/i.test(message) ? "You cancelled in your wallet. Nothing was shared." : message });
    }
  }

  const busy = step.s === "connecting" || step.s === "signing" || step.s === "reading";
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 py-5">
        <a href="/" className="text-2xl font-bold tracking-tight">Glass<span className="text-accent">house</span></a>
        <a href="/" className="text-base font-semibold text-ink-2 underline-offset-4 hover:underline">See the demo</a>
      </header>

      <section className="py-8 sm:py-12">
        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">What does your agent&apos;s wallet give away?</h1>
        <p className="mt-4 max-w-2xl text-xl text-ink-2">
          Sign one message to prove the wallet is yours. We read its public Base payments and show you what a stranger could work out.
        </p>
        <p className="mt-3 max-w-2xl text-lg font-medium">You can only audit a wallet you own. We never show anyone else&apos;s profile.</p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          {busy ? (
            <p className="rounded-full bg-accent px-7 py-3 text-lg font-semibold text-white" role="status">
              {step.s === "connecting" ? "Connecting…" : step.s === "signing" ? "Check your wallet to sign…" : "Reading your payments…"}
            </p>
          ) : wallets.length > 0 ? (
            wallets.map((w) => (
              <button key={w.id} type="button" onClick={() => run(w.provider)}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-lg font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {w.icon && <img src={w.icon} alt="" width={24} height={24} className="rounded" />}
                Audit with {w.name}
              </button>
            ))
          ) : (
            <button type="button" onClick={() => run()}
              className="rounded-full bg-accent px-7 py-3 text-lg font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              Connect wallet and audit
            </button>
          )}
          <Counter />
        </div>
        <p className="mt-3 text-base text-ink-2">Signing is free and moves no funds. Works with ordinary and smart wallets (Coinbase Smart Wallet, Safe). Reading a day of history can take up to a minute.</p>
        <ServerSign post={postJson} onDone={(address, facts) => setStep({ s: "done", address, facts })} onError={(message) => setStep({ s: "error", message })} />
      </section>

      {step.s === "error" && (
        <div data-testid="audit-error" className="rounded-2xl border border-exposed bg-exposed-soft p-5 text-lg" role="alert">{step.message}</div>
      )}

      {step.s === "done" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <p className="text-sm font-medium uppercase tracking-wide text-ink-2">Your wallet</p>
            <p className="mt-1 break-all font-mono text-base">{step.address}</p>
            <p className={`tabular mt-4 text-5xl font-black ${step.facts.linkability.traced ? "text-exposed" : "text-safe"}`}>
              {step.facts.linkability.traced} <span className="text-2xl font-semibold text-ink-2">x402-style payments readable by anyone</span>
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <ProfilePanel p={step.facts} />
            <SleepStrip p={step.facts} />
          </div>
          <Alerts />
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <p className="max-w-xl text-lg">Want the full report across all your agents and the last 90 days, with fixes?</p>
            <ProButton />
          </div>
        </div>
      )}
    </div>
  );
}
