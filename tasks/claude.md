# Task brief: Claude (lead engineer)

## Paste this to start Claude
> You are the lead engineer on Glasshouse. Read `CLAUDE.md`, `AGENTS.md`, `CONTRACTS.md` and `PLAYBOOK.md` fully before writing code. Then do **Phase 0** from this file only. Stop when Gate 0 passes, show me the `pnpm demo:check` output, and update `HANDOFF.md`. Don't start Phase 1 until I say so.

---

## Phase 0: Foundation (you go first; everyone waits on this)
1. pnpm monorepo: `apps/web` (Next.js App Router + TypeScript + Tailwind, empty pages are fine), `packages/engine`, `packages/tigergraph`, `packages/chain` (empty stub with the function signatures from CONTRACTS.md, throwing "not implemented"), `contracts/` and `services/relayer` (empty folders with README).
2. `packages/engine/src/types.ts`: every type from CONTRACTS.md, exported.
3. `packages/engine/src/simulate.ts`: seeded synthetic ledger generator (use a seeded PRNG, no `Math.random`):
   - 10 days from 18 Oct 2026; 16 services across the 7 categories; 4 labelled exchanges.
   - 5 detailed people including **"you"**: UTC+05:30, 1 personal wallet + 3 agents; one agent (travel) funded straight from an exchange so only Rule 2 can catch it; sleeps 01:00–08:30 local; health burst 24–26 Oct; career, legal, finance, travel activity tuned so "you" shows exactly 5 signals and 238 agent payments.
   - ~260 background agent wallets and ~220 other rail users so the graph looks like a real crowd.
   - Also outputs `GroundTruth` (tests only).
   - Shield variant: same "you" activity, but agents funded via the rail and paying from one-time wallets per session.
4. Commit fixtures: `fixtures/ledger.seed42.json`, `fixtures/ledger.seed42.shield.json`, `fixtures/truth.seed42.json`, and hand-checked `fixtures/profile.open.json`, `fixtures/profile.shield.json`, `fixtures/graph.open.json`, `fixtures/graph.shield.json` (these may be produced by the engine once Phase 1 is done; for Phase 0, generate them with the expected values so Antigravity can start).
5. `pnpm test` (Vitest) and `pnpm demo:check` (a script that prints each gate from PLAYBOOK.md as PASS/FAIL/PENDING).
6. `.env.example`, `HANDOFF.md` (empty template), root README with run instructions.

**Gate 0:** fresh clone → `pnpm install && pnpm test` green; fixtures validate against the types; `pnpm demo:check` runs.

## Phase 1: Engine (the attack, offline)
- `analyze.ts`: Rule 1 and Rule 2 exactly as CONTRACTS.md §3, producing `SameOwnerLink[]` with evidence text.
- `profile.ts`: walk SAME_OWNER from a seed wallet → identity anchor, time zone (48-slot method), signals (thresholds table), spend, linkability, hourly, anonymity_set (shield: distinct depositors into the rail before that wallet was funded).
- `graphView.ts`: `GraphView` for the seed wallet's neighbourhood (keep it under ~300 nodes).
- Regenerate the profile/graph fixtures from the engine.

**Gate 1 tests:** seed 42 "you" → 4 wallets, offset +330 min, 5 signals, 238/238; shield → 0/238; zero false links vs ground truth across seeds 1–4.

## Phase 2: TigerGraph parity + API
- `packages/tigergraph/schema.gsql`: Wallet, Bucket (2-min), TRANSFER, ACTIVE_IN, SAME_OWNER (as in CONTRACTS.md).
- Queries: `link_funding.gsql`, `link_coactivity.gsql`, `owner_profile.gsql`. Read the current TigerGraph Savanna REST docs before writing `client.ts`; batch upserts (~2,000 records per request).
- `load.ts`: loads a `Ledger` into TigerGraph.
- `pnpm test:parity`: run engine and TigerGraph on seed 42 and diff the results; must match.
- API routes in `apps/web/app/api/*` exactly per CONTRACTS.md §4; read from TigerGraph, fall back to the engine when `OFFLINE_MODE=true` or TigerGraph fails.
- `/api/narrative`: Claude API, input `ProfileFacts` only, 4 sentences, "likely" for inferences.

**Gate 2:** parity test green; API returns valid `ProfileFacts`; Antigravity's UI works against the live API.

## Phase 3: Shield through the same analysis
- Load the shield ledger (and Codex's real testnet one-time-wallet payments) through the exact same queries. No special-casing shield mode in the logic.

**Gate 3:** 0/238 traced via TigerGraph; anonymity_set shown.

## Phase 4: Live with users
- `/api/audit/challenge` + `/api/audit` using Codex's `verifyOwnership` and `fetchAgentTransfers`; reject invalid signatures with 401; nonce single-use, expires in 5 minutes.
- `/api/stats`: totals only (audits run, how many leaked a time zone). No addresses stored beyond what's needed to dedupe, hashed.
- `/api/checkout`: Dodo checkout, test mode (read Dodo docs first).
- viaSocket: POST a leak alert to `VIASOCKET_WEBHOOK_URL` when an audit finds a new signal (opt-in only).

**Gate 4:** deployed; your own wallet audits; a foreign wallet gets 401; stats increment; checkout opens.

## Phase 5: Hardening
- `OFFLINE_MODE` end-to-end check; `pnpm demo:check` all PASS; help record the backup video.
