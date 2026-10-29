"use client";
// For agent wallets that live on a server (a private key in an env var, a CDP server wallet, Foundry): get the
// challenge here, sign it where the key lives with any EIP-191 personal_sign tool, paste back only the signature.
// The private key never comes near this site.
import { useState } from "react";
import type { ProfileFacts } from "@glasshouse/engine";

interface Props {
  post: <T>(url: string, body: unknown) => Promise<T>;
  onDone: (address: string, facts: ProfileFacts) => void;
  onError: (message: string) => void;
}

const COMMANDS = (file: string) => [
  ["Foundry", `cast wallet sign --private-key "$AGENT_PRIVATE_KEY" "$(cat ${file})"`],
  ["Node (viem)", `node -e 'require("viem/accounts").privateKeyToAccount(process.env.AGENT_PRIVATE_KEY).signMessage({message:require("fs").readFileSync("${file}","utf8")}).then(console.log)'`],
  ["Python (eth-account)", `python3 -c 'import os;from eth_account import Account;from eth_account.messages import encode_defunct;s=Account.sign_message(encode_defunct(text=open("${file}").read()),os.environ["AGENT_PRIVATE_KEY"]).signature.hex();print(s if s.startswith("0x") else "0x"+s)'`],
] as const;

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}
      className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-accent">
      {done ? "Copied" : label}
    </button>
  );
}

export function ServerSign({ post, onDone, onError }: Props) {
  const [address, setAddress] = useState("");
  const [challenge, setChallenge] = useState<{ message: string; nonce: string; address: string } | null>(null);
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = /^0x[0-9a-fA-F]{40}$/.test(address.trim());

  async function getChallenge() {
    setBusy(true);
    try {
      const a = address.trim();
      setChallenge({ ...(await post<{ message: string; nonce: string }>("/api/audit/challenge", { address: a })), address: a });
      setSignature("");
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!challenge) return;
    setBusy(true);
    try {
      onDone(challenge.address.toLowerCase(), await post<ProfileFacts>("/api/audit", { address: challenge.address, signature: signature.trim(), nonce: challenge.nonce }));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const file = "glasshouse-challenge.txt";
  return (
    <details className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-6" data-testid="server-sign">
      <summary className="cursor-pointer text-lg font-semibold">Agent wallet on a server? Sign without a browser wallet</summary>
      <p className="mt-3 text-base text-ink-2">
        For a private key in your agent&apos;s environment, a CDP server wallet or Foundry. You sign where the key lives and paste back only the signature.{" "}
        <strong className="text-ink">Never paste a private key here.</strong>
      </p>

      <label className="mt-4 block text-base font-medium" htmlFor="server-address">Agent wallet address</label>
      <div className="mt-1 flex flex-wrap gap-3">
        <input id="server-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 font-mono text-base" />
        <button type="button" onClick={getChallenge} disabled={!valid || busy}
          className="rounded-full bg-accent px-5 py-2 text-base font-semibold text-white disabled:opacity-50">Get challenge</button>
      </div>

      {challenge && (
        <div className="mt-5 space-y-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-base font-medium">1. Save this message as <code className="font-mono">{file}</code> where the key lives (valid 5 minutes)</p>
              <div className="flex gap-2">
                <Copy text={challenge.message} label="Copy message" />
                <a download={file} href={`data:text/plain;charset=utf-8,${encodeURIComponent(challenge.message)}`}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-accent">Download</a>
              </div>
            </div>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-3 text-sm" data-testid="challenge-text">{challenge.message}</pre>
          </div>
          <div>
            <p className="text-base font-medium">2. Sign it there with any one of these (the key stays in <code className="font-mono">$AGENT_PRIVATE_KEY</code>)</p>
            <ul className="mt-2 space-y-2">
              {COMMANDS(file).map(([tool, cmd]) => (
                <li key={tool} className="rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{tool}</span><Copy text={cmd} label="Copy" /></div>
                  <code className="mt-1 block overflow-x-auto whitespace-pre font-mono text-xs text-ink-2">{cmd}</code>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <label className="text-base font-medium" htmlFor="server-signature">3. Paste the signature it prints</label>
            <textarea id="server-signature" value={signature} onChange={(e) => setSignature(e.target.value)} rows={3} spellCheck={false} placeholder="0x…"
              className="mt-1 block w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm" />
            <button type="button" onClick={submit} disabled={!/^0x[0-9a-fA-F]+$/.test(signature.trim()) || busy}
              className="mt-3 rounded-full bg-accent px-6 py-2.5 text-base font-semibold text-white disabled:opacity-50">
              {busy ? "Reading your payments…" : "Audit this wallet"}
            </button>
          </div>
        </div>
      )}
    </details>
  );
}
