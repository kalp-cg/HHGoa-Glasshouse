// Opt-in leak alerts to the user's own Telegram, through viaSocket (viasocket-apps 0.11.0; its types are its docs).
// Plan agreed with Kalp: the user connects their bot once, picks their chat once (from list-messages), and
// send-message runs only from /api/audit for leaks not alerted before. auth_id, script_id and chat stay on the server.
import { ViaSocket } from "viasocket-apps";
import type { ProfileFacts } from "@glasshouse/engine";
import { HttpError } from "./http";
import { store } from "./store";

export const APP = "telegram"; // the app page says "telegram-bot", but serviceIdFor() only resolves "telegram"
// Action pages (ids and inputData): documentation/<telegram service>/list-messages.md and /send-message.md
// on https://flow.viasocket.com/documentation/ . versionIdFor takes the action_id and its version, as those pages show.

interface AlertRecord { authId: string; scriptId: string; chat?: string; chatLabel?: string; alerted: string[] }
export interface Chat { value: string; label: string }

let vs: ViaSocket | undefined;
function viasocket(): ViaSocket {
  const { VIASOCKET_ORG_ID: orgId, VIASOCKET_PROJECT_ID: projectId, VIASOCKET_EMBED_SECRET: secret } = process.env;
  if (!orgId || !projectId || !secret) throw new HttpError(503, "alerts are not configured");
  return (vs ??= new ViaSocket({ orgId, projectId, secret }));
}

const key = (uid: string) => `alerts:${uid}`;
async function load(uid: string): Promise<AlertRecord | null> {
  const raw = await store().get(key(uid));
  return raw ? (JSON.parse(raw) as AlertRecord) : null;
}
const save = (uid: string, r: AlertRecord) => store().set(key(uid), JSON.stringify(r));

export async function connectToken(uid: string): Promise<{ token: string; serviceIds: Record<string, string> }> {
  const v = viasocket();
  return { token: await v.user(uid).token(), serviceIds: { [APP]: await v.catalog.serviceIdFor(APP) } };
}

// After Connect: check the auth_id is this user's own, enable the app once, keep both on the server.
export async function saveConnection(uid: string, authId: unknown): Promise<void> {
  if (typeof authId !== "string" || !authId) throw new HttpError(400, "authId missing");
  const v = viasocket();
  const user = v.user(uid);
  const mine = (await user.listConnections()) as { id?: string }[];
  if (!mine.some((c) => c.id === authId)) throw new HttpError(403, "that connection does not belong to you");
  const serviceId = await v.catalog.serviceIdFor(APP);
  const scriptId = (await user.findEnabled(serviceId)) ?? (await user.enable(serviceId, authId)).scriptId;
  const prev = await load(uid);
  await save(uid, { authId, scriptId, alerted: prev?.alerted ?? [] });
}

// Telegram's getUpdates-style result: collect every { chat: { id, ... } } in it.
export function chatsFrom(result: unknown): Chat[] {
  const found = new Map<string, string>();
  const walk = (x: unknown) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    const chat = o.chat as Record<string, unknown> | undefined;
    if (chat && (typeof chat.id === "number" || typeof chat.id === "string")) {
      const name = [chat.title, chat.first_name, chat.last_name].filter(Boolean).join(" ") || (chat.username ? `@${chat.username}` : "");
      found.set(String(chat.id), name || `Chat ${chat.id}`);
    }
    Object.values(o).forEach(walk);
  };
  walk(result);
  return [...found].map(([value, label]) => ({ value, label }));
}

async function connected(uid: string): Promise<AlertRecord> {
  const r = await load(uid);
  if (!r) throw new HttpError(409, "connect Telegram first");
  return r;
}

export async function listChats(uid: string): Promise<Chat[]> {
  const r = await connected(uid);
  const v = viasocket();
  const versionId = await v.catalog.versionIdFor(await v.catalog.serviceIdFor(APP), "rowv46l6a6dw", "V3");
  return chatsFrom(await v.runAction(r.scriptId, versionId, {}));
}

// The chat is picked from the list, never typed.
export async function setChat(uid: string, chat: unknown): Promise<Chat> {
  const r = await connected(uid);
  const pick = (await listChats(uid)).find((c) => c.value === chat);
  if (!pick) throw new HttpError(400, "pick a chat from the list (send your bot a message first)");
  await save(uid, { ...r, chat: pick.value, chatLabel: pick.label });
  return pick;
}

export async function status(uid: string): Promise<{ connected: boolean; chat: string | null }> {
  const r = await load(uid);
  return { connected: Boolean(r), chat: r?.chatLabel ?? null };
}

export async function disconnect(uid: string): Promise<void> {
  const r = await load(uid);
  if (!r) return;
  await viasocket().user(uid).revokeConnection(r.authId);
  await store().set(key(uid), "", 1);
}

// Leaks worth an alert: the time zone and each life signal. Only ones not alerted before are sent.
export const leakKeys = (f: ProfileFacts) => [...(f.timezone ? [`tz:${f.timezone.label}`] : []), ...f.signals.map((s) => `signal:${s.category}`)];

export function alertText(f: ProfileFacts, fresh: string[]): string {
  const lines = [`Glasshouse audit: ${f.linkability.traced} of your agent's payments can be traced to you.`];
  if (f.timezone && fresh.includes(`tz:${f.timezone.label}`)) {
    lines.push(`New: your time zone is likely ${f.timezone.label} (no payments ${f.timezone.sleep_start_local}–${f.timezone.sleep_end_local}).`);
  }
  for (const s of f.signals) if (fresh.includes(`signal:${s.category}`)) lines.push(`New: "${s.text}" (${s.count} paid calls).`);
  lines.push("Shield mode pays from one-time wallets so none of this links back to you.");
  return lines.join("\n");
}

// Called by /api/audit. Never throws: an alert failing must not fail the audit.
export async function notifyLeak(uid: string, facts: ProfileFacts, siteUrl: string): Promise<"sent" | "nothing-new" | "not-connected" | "failed"> {
  try {
    const r = await load(uid);
    if (!r?.chat) return "not-connected";
    const fresh = leakKeys(facts).filter((k) => !r.alerted.includes(k));
    if (fresh.length === 0) return "nothing-new";
    const v = viasocket();
    const versionId = await v.catalog.versionIdFor(await v.catalog.serviceIdFor(APP), "rowg5vf64", "V33");
    await v.runAction(r.scriptId, versionId, {
      chat: r.chat,
      message_type: "text",
      text_message: { text: alertText(facts, fresh) },
      buttons: { inline_buttons: { "See your audit": `${siteUrl}/audit` } },
    });
    await save(uid, { ...r, alerted: [...r.alerted, ...fresh] });
    return "sent";
  } catch (err) {
    console.warn(`leak alert failed: ${err instanceof Error ? err.message : String(err)}`);
    return "failed";
  }
}
