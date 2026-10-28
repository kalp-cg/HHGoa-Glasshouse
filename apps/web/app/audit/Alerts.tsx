"use client";
// Opt-in leak alerts in the user's own Telegram, via viaSocket's Connect popup (viasocket-apps/browser).
// Shown after an audit (the audit sets the session these routes need). Connect once, pick the chat once.
import { useEffect, useState } from "react";
import { connect, loadConnectScript } from "viasocket-apps/browser";

const APP = "telegram";
const ACTIONS = ["rowg5vf64", "rowv46l6a6dw"]; // send-message, list-messages: consent asks only these scopes
const ICON = "https://stuff.thingsofbrand.com/telegram.org/images/img6c1c10f144_telegram.jpg";

type Status = { connected: boolean; chat: string | null };
type Chat = { value: string; label: string };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((out as { error?: string }).error ?? `HTTP ${res.status}`);
  return out as T;
}

export function Alerts() {
  const [status, setStatus] = useState<Status | null>(null);
  const [embed, setEmbed] = useState<{ token: string; serviceId: string } | null>(null);
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    call<Status>("/api/viasocket/connected").then(setStatus).catch((e: Error) => setMsg(e.message));
    // on load, not in the click: the popup must open straight from the click
    call<{ token: string; serviceIds: Record<string, string> }>(`/api/viasocket/token?apps=${APP}`)
      .then((t) => setEmbed({ token: t.token, serviceId: t.serviceIds[APP]! }))
      .catch(() => setEmbed(null));
    loadConnectScript().catch(() => undefined);
  }, []);

  const saved = async (authId: string) => {
    setStatus(await call<Status>("/api/viasocket/connected", { method: "POST", body: JSON.stringify({ authId }) }));
    setMsg("Connected. Now send your bot any message in Telegram, then pick your chat below.");
  };

  async function onConnect() {
    if (!embed) return;
    setMsg(null);
    try {
      const { authId } = await connect({
        embedToken: embed.token, serviceId: embed.serviceId, actions: ACTIONS, skipActionSelection: true,
        onLateSuccess: ({ authId: late }) => void saved(late),
      });
      await saved(authId);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "closed") setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  async function findChats() {
    setMsg(null);
    try {
      const list = await call<Chat[]>("/api/viasocket/chats");
      setChats(list);
      if (list.length === 0) setMsg("No chats yet. Send your bot a message in Telegram, then try again.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section aria-labelledby="alerts-h" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 id="alerts-h" className="text-xl font-semibold">Leak alerts in Telegram</h2>
      <p className="mt-1 text-base text-ink-2">Optional. We message you only when a new audit finds something new about you. Never anyone else&apos;s data.</p>

      {status && !status.connected && (
        <button onClick={onConnect} disabled={!embed}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-5 py-2.5 text-base font-semibold disabled:opacity-60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ICON} alt="" width={22} height={22} className="rounded" /> Connect Telegram
        </button>
      )}

      {status?.connected && (
        <div className="mt-4 space-y-3">
          <p className="text-lg">
            Alerts go to: <strong>{status.chat ?? "no chat picked yet"}</strong>
          </p>
          <div className="flex flex-wrap gap-3">
            <button onClick={findChats} className="rounded-full border border-line px-4 py-2 text-base font-semibold">
              {status.chat ? "Change chat" : "Pick your chat"}
            </button>
            <button onClick={async () => setStatus(await call<Status>("/api/viasocket/connected", { method: "DELETE" }))}
              className="rounded-full px-4 py-2 text-base font-semibold text-ink-2 underline-offset-4 hover:underline">
              Turn alerts off
            </button>
          </div>
          {chats && chats.length > 0 && (
            <ul className="space-y-2">
              {chats.map((c) => (
                <li key={c.value}>
                  <button onClick={async () => {
                    const pick = await call<Chat>("/api/viasocket/chat", { method: "POST", body: JSON.stringify({ chat: c.value }) });
                    setStatus({ connected: true, chat: pick.label });
                    setChats(null);
                  }} className="rounded-lg border border-line px-4 py-2 text-left text-base hover:border-accent">{c.label}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {msg && <p className="mt-3 text-base text-ink-2" role="status">{msg}</p>}
    </section>
  );
}
