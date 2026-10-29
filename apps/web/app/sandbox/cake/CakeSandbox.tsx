"use client";
// The simulated phone flow. Nothing here signs, sends or calls a wallet: the steps are timed, the tx hashes are
// random and labelled as simulated. Only the "what a stranger sees" panel is real, from the engine fixtures.
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProfileFacts } from "@glasshouse/engine";

type Route = "cake" | "exchange";
type Screen = "home" | "route" | "sending" | "done";

interface Props { exchange: ProfileFacts; cake: ProfileFacts; wallet: string; swapWallet: string | null; usdc: number }

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const fakeHash = () => `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("")}`;

function steps(route: Route, p: Props): string[] {
  const top = route === "cake"
    ? [`Swapping Monero (XMR) for ${p.usdc} USDC inside Cake Wallet`, `Swap service pays ${p.usdc} USDC on Base to ${short(p.wallet)}`]
    : [`Withdrawing ${p.usdc} USDC from your Exchange A account (verified with your ID)`, `Exchange A pays ${p.usdc} USDC on Base to ${short(p.wallet)}`];
  return [...top, "Depositing into the Shield Rail", "Rail funds a fresh one-time wallet for each agent session"];
}

function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[360px] rounded-[2.5rem] border-[10px] border-ink bg-ink p-0 shadow-xl">
      <div className="min-h-[600px] overflow-hidden rounded-[1.8rem] bg-[#11141c] text-[#f2f5f9]">
        <div className="flex items-center justify-between px-5 pt-3 text-xs text-[#9aa5b4]"><span>9:41</span><span>Sandbox</span></div>
        {children}
      </div>
    </div>
  );
}

function Verdict({ p, route }: { p: ProfileFacts; route: Route }) {
  const named = p.identity_anchor;
  return (
    <section aria-live="polite" data-testid="verdict" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-xl font-semibold">What a stranger can still work out (Shield on)</h2>
      <p className="mt-1 text-base text-ink-2">Real Glasshouse engine output on the demo world, topped up {route === "cake" ? "from Cake Wallet" : "from Exchange A"}.</p>
      <div className={`mt-4 rounded-xl p-4 ${named ? "bg-exposed-soft text-exposed" : "bg-safe-soft text-safe"}`}>
        <p className="text-2xl font-semibold">
          {named ? <>Still named: funded from {named.exchange_label}.</> : "No exchange in your history. Nothing names you."}
        </p>
        <p className="mt-1 text-lg">
          {named
            ? <>{named.exchange_label} holds your ID, and the chain shows it sent your wallet the money behind every Shield deposit.</>
            : "The money arrived from a swap wallet that knows no name. The Shield deposits lead back only to that."}
        </p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-3">
        <div className="rounded-xl bg-surface-2 p-3"><dt className="text-sm text-ink-2">Payments traced</dt><dd className="tabular text-2xl font-bold">{p.linkability.traced} / {p.linkability.total}</dd></div>
        <div className="rounded-xl bg-surface-2 p-3"><dt className="text-sm text-ink-2">Hidden among</dt><dd className="tabular text-2xl font-bold">{p.anonymity_set ?? "–"} people</dd></div>
        <div className="col-span-2 rounded-xl bg-surface-2 p-3 sm:col-span-1"><dt className="text-sm text-ink-2">Real name via</dt><dd className={`text-2xl font-bold ${named ? "text-exposed" : "text-safe"}`}>{named ? named.exchange_label : "nobody"}</dd></div>
      </dl>
    </section>
  );
}

export function CakeSandbox(props: Props) {
  const [screen, setScreen] = useState<Screen>("home");
  const [route, setRoute] = useState<Route>("cake");
  const [done, setDone] = useState<{ text: string; tx: string }[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const list = useMemo(() => steps(route, props), [route, props]);

  useEffect(() => {
    if (screen !== "sending") return;
    if (done.length === list.length) { setScreen("done"); return; }
    timer.current = setTimeout(() => setDone((d) => [...d, { text: list[d.length]!, tx: fakeHash() }]), 900);
    return () => clearTimeout(timer.current);
  }, [screen, done, list]);

  const start = (r: Route) => { setRoute(r); setDone([]); setScreen("sending"); };
  const reset = () => { clearTimeout(timer.current); setDone([]); setScreen("home"); };
  const btn = "w-full rounded-2xl px-4 py-3 text-left text-base font-semibold";

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 py-5">
        <a href="/" className="text-2xl font-bold tracking-tight">Glass<span className="text-accent">house</span></a>
        <a href="/" className="text-base font-semibold text-ink-2 underline-offset-4 hover:underline">Back to the demo</a>
      </header>

      <p role="note" className="rounded-xl border-2 border-dashed border-accent bg-surface p-3 text-base">
        <strong>Sandbox, simulated.</strong> No real wallet, money or transaction is involved, and the phone is an illustration,
        not the Cake Wallet app. The verdict on the right is the real Glasshouse engine on the demo world.
      </p>

      <h1 className="mt-6 text-3xl font-black tracking-tight sm:text-4xl">Shield hides your payments. Cake Wallet hides where the money came from.</h1>
      <p className="mt-2 max-w-3xl text-lg text-ink-2">
        With Shield on, your agents pay from one-time wallets and none of their 238 payments trace back. But a stranger can still
        see who sent you the money. Top up from an exchange, and the exchange knows your name. Top up from Cake Wallet, and it doesn&apos;t.
      </p>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[380px_1fr]">
        <Phone>
          <div className="px-5 pb-6 pt-4" data-testid="phone" data-screen={screen}>
            <p className="text-lg font-bold">Cake Wallet <span className="ml-1 rounded bg-[#2557d6] px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase">sandbox</span></p>
            {screen === "home" && (
              <>
                <div className="mt-5 rounded-2xl bg-[#1b2130] p-4">
                  <p className="text-sm text-[#9aa5b4]">Monero</p><p className="tabular text-2xl font-bold">2.6140 XMR</p>
                  <p className="mt-3 text-sm text-[#9aa5b4]">USDC on Base · {short(props.wallet)}</p><p className="tabular text-2xl font-bold">0.00 USDC</p>
                </div>
                <p className="mt-5 text-sm text-[#9aa5b4]">Your agents need {props.usdc} USDC in Shield.</p>
                <button type="button" onClick={() => setScreen("route")} className={`${btn} mt-2 bg-[#2557d6] text-center`}>Top up agents&apos; Shield</button>
              </>
            )}
            {screen === "route" && (
              <div className="mt-5 space-y-3">
                <p className="text-base">Where should {props.usdc} USDC come from?</p>
                <button type="button" onClick={() => start("cake")} className={`${btn} bg-[#0e7c66]`}>
                  Swap XMR privately in Cake Wallet<span className="block text-sm font-normal opacity-80">No account, no ID</span>
                </button>
                <button type="button" onClick={() => start("exchange")} className={`${btn} bg-[#1b2130]`}>
                  Withdraw from Exchange A<span className="block text-sm font-normal opacity-80">Your verified exchange account</span>
                </button>
                <button type="button" onClick={reset} className="w-full py-2 text-sm text-[#9aa5b4]">Cancel</button>
              </div>
            )}
            {(screen === "sending" || screen === "done") && (
              <>
                <ol className="mt-5 space-y-3" aria-live="polite">
                  {list.map((text, i) => {
                    const step = done[i];
                    return (
                      <li key={text} className={`rounded-xl p-3 text-sm ${step ? "bg-[#1b2130]" : "bg-[#151a25] text-[#5b6b82]"}`}>
                        <span className="font-semibold">{step ? "✓" : i === done.length ? "…" : "·"} {text}</span>
                        {step && <span className="mt-1 block font-mono text-[11px] text-[#9aa5b4]">simulated tx {short(step.tx)}</span>}
                      </li>
                    );
                  })}
                </ol>
                {screen === "done" && (
                  <div className="mt-4 space-y-2">
                    <p className="text-center text-base font-semibold text-[#35d0a8]">Agents topped up</p>
                    <button type="button" onClick={() => start(route === "cake" ? "exchange" : "cake")} className={`${btn} bg-[#1b2130] text-center`}>
                      Try the {route === "cake" ? "exchange" : "Cake Wallet"} route
                    </button>
                    <button type="button" onClick={reset} className="w-full py-2 text-sm text-[#9aa5b4]">Start over</button>
                  </div>
                )}
              </>
            )}
          </div>
        </Phone>

        <div className="space-y-6">
          {screen === "done"
            ? <Verdict p={route === "cake" ? props.cake : props.exchange} route={route} />
            : (
              <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
                <h2 className="text-xl font-semibold">Pick a route on the phone</h2>
                <p className="mt-2 text-lg text-ink-2">When the top-up finishes, this panel shows what the Glasshouse engine can still work out about you.</p>
              </section>
            )}
          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="text-xl font-semibold">How the two routes look on chain</h2>
            <ul className="mt-3 space-y-2 text-lg">
              <li><strong className="text-exposed">Exchange A</strong> → your wallet → Shield Rail → one-time wallets → services. The first hop names you.</li>
              <li><strong className="text-safe">Cake Wallet swap</strong> → your wallet → Shield Rail → one-time wallets → services. The first hop is a swap wallet with no names.</li>
            </ul>
            <p className="mt-3 text-base text-ink-2">
              {props.swapWallet && <>In the simulated world the swap wallet is <code className="font-mono">{short(props.swapWallet)}</code>. </>}
              Cake Wallet is an open-source, non-custodial wallet with Monero and a built-in exchange.{" "}
              <a className="text-accent underline" href="https://cakewallet.com" target="_blank" rel="noreferrer">cakewallet.com</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
