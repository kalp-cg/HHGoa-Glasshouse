// Plain-English write-up of ProfileFacts. Input is the facts object and nothing else (AGENTS.md rule 5).
// Claude API usage per the Anthropic TypeScript SDK docs (@anthropic-ai/sdk 1.3.0).
import Anthropic from "@anthropic-ai/sdk";
import type { ProfileFacts } from "@glasshouse/engine";

const MODEL = "claude-opus-5-5";

const SYSTEM = `You explain what a stranger can learn from an AI agent's public on-chain payments.
You receive a JSON object of facts about one person. Write exactly 4 sentences in plain English, addressed to that person as "you".
Use only the facts given; never invent numbers, names, places or services.
Say "likely" for anything inferred (identity via an exchange, time zone, life signals); state counts as facts.
Never write wallet addresses or transaction hashes. Output only the 4 sentences.

What the fields mean:
- linkability.traced of linkability.total: how many of the person's agent payments a stranger can tie to them. If traced is 0, none can be traced to them: say that plainly. The payments still happened; they just cannot be linked.
- mode "open": the agents paid from wallets that can be linked to the person. mode "shield": each session paid from a fresh one-time wallet.
- anonymity_set (shield only): each payment could belong to any of that many people.
- identity_anchor: the exchange that funded the person's wallets, which likely knows their real name. Mention it only if it is not null and traced is above 0.
- timezone and signals: what a stranger could work out. If they are null or empty, say nothing could be worked out.
- spend: total payments and USDC among the traced ones.`;

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

// Deterministic write-up: used offline, without a key, or if the API call fails.
export function templateNarrative(f: ProfileFacts): string {
  const { traced, total } = f.linkability;
  if (traced === 0) {
    return [
      `None of your agents' ${total} paid API calls can be traced back to you.`,
      "Each session paid from a fresh one-time wallet funded through the shared rail, so nothing links those wallets to each other or to you.",
      f.anonymity_set
        ? `Each payment could belong to any of ${f.anonymity_set} people who used the rail.`
        : "Each payment blends into everyone else who used the rail.",
      "No time zone, daily routine or life signals can be worked out from them.",
    ].join(" ");
  }
  const signals = f.signals.map((s) => s.text.charAt(0).toLowerCase() + s.text.slice(1));
  return [
    `Anyone reading the public ledger can tie ${traced} of your agents' ${total} paid API calls to one person across ${f.wallets.length} wallets.`,
    f.identity_anchor
      ? `Your wallets were funded from ${f.identity_anchor.exchange_label}, which likely knows your real name.`
      : "No exchange ties these wallets to a named account.",
    f.timezone
      ? `Payments stop between ${f.timezone.sleep_start_local} and ${f.timezone.sleep_end_local} local time, which likely puts you in ${f.timezone.label}.`
      : "There are too few traced payments to guess your time zone.",
    signals.length
      ? `The services your agents paid for suggest you are likely ${list(signals)}.`
      : "No life signals stand out from the traced payments.",
  ].join(" ");
}

// Groq's OpenAI-compatible chat API (free tier): https://console.groq.com/docs/api-reference
async function groqNarrative(facts: ProfileFacts): Promise<string> {
  const model = process.env.NARRATIVE_MODEL || "openai/gpt-oss-120b";
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_completion_tokens: 900,
      // gpt-oss models are reasoning models: without a low effort they can spend every token thinking and answer nothing
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(facts) }],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content?.trim() ?? "";
}

async function claudeNarrative(facts: ProfileFacts): Promise<string> {
  const client = new Anthropic({ timeout: 30_000, maxRetries: 1 });
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(facts) }],
  });
  if (response.stop_reason === "refusal") return "";
  return response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ").trim();
}

// Provider order: Groq (free) if GROQ_API_KEY, else Claude if ANTHROPIC_API_KEY, else the template.
// A real person's audit (source "base-mainnet") is never sent to an outside model: it always gets the template.
export async function narrative(facts: ProfileFacts): Promise<{ text: string; source: "groq" | "claude" | "template" }> {
  const template = { text: templateNarrative(facts), source: "template" as const };
  if (facts.source !== "synthetic") return template;
  const provider = process.env.GROQ_API_KEY ? "groq" : process.env.ANTHROPIC_API_KEY ? "claude" : null;
  if (!provider) return template;
  try {
    const text = provider === "groq" ? await groqNarrative(facts) : await claudeNarrative(facts);
    return text ? { text, source: provider } : template;
  } catch (err) {
    if (err instanceof Anthropic.APIError) console.warn(`Claude API ${err.status}: ${err.message}`);
    else console.warn(`${provider} write-up failed: ${err instanceof Error ? err.message : String(err)}`);
    return template;
  }
}
