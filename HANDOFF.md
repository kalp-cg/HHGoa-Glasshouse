# HANDOFF.md

Each agent adds an entry at the end of every work session. Newest at the bottom.

```
## <agent> · <short date>
Done:
Next:
Blocked on / needs from others:
Contract change request (if any):
Later (ideas, not now):
```

## Claude · 28 Oct
Done:
- Phase 0 / Gate 0 green. pnpm monorepo (pnpm 12, Node ≥ 22.12): `apps/web` (Next 16 + React 19 + Tailwind 4, placeholder page), `packages/engine`, `packages/tigergraph` (empty), `packages/chain` (CONTRACTS §5 stubs throwing "not implemented"), `contracts/` + `services/relayer` (README only).
- `packages/engine/src/types.ts`: CONTRACTS §2 verbatim. `validate.ts`: runtime validators for every contract type (fixtures now, API responses in Gate 2).
- `simulate.ts`: seeded generator (mulberry32, no Math.random). 18–27 Oct 2026, 16 services / 7 categories, 4 exchanges, the "Shield Rail" pool, "you" + 4 detailed people, 260 background agents, 220 rail users. Open and shield modes share identical "you" activity.
- Fixtures committed for seed 42 (8 files, see README). Profile and graph fixtures are derived from ground truth for now; Phase 1 regenerates them from the engine.
- `pnpm test` (26 tests), `pnpm typecheck`, `pnpm demo:check`.

Next (Phase 1, waiting for Kalp's go): `analyze.ts` (Rule 1, Rule 2), `profile.ts`, `graphView.ts`, then regenerate fixtures from the engine.

Blocked on / needs from others: nothing.

Notes for everyone:
- **Antigravity:** build against `fixtures/profile.*.json` and `fixtures/graph.*.json`. Graph nodes: `owned: true` = the person's linked wallets (4 open, 1 shield); `kind: "one-time"` = rail-funded wallets. Each graph has about 220 nodes; TRANSFER edges are aggregated per wallet pair, with labels like "12 payments · 0.36 USDC". The values won't change shape in Phase 1, but the exact numbers (e.g. link details) may move a little when the engine takes over.
- **Codex:** `packages/chain/src/index.ts` holds the stubs plus one test asserting they throw. Replace both freely. `Ledger` format examples: `fixtures/ledger.seed42*.json`.
- pnpm 12 blocks dependency build scripts by default. Approve them with `pnpm approve-builds <pkg>` (it writes `allowBuilds` in `pnpm-workspace.yaml`).

Decisions made under ambiguity (simplest option that satisfies CONTRACTS):
- **Sleep window.** "You" sleeps 01:00–08:30 local, but agents don't pay until 09:00. A detected gap of 01:00–08:30 has its centre at 04:45 local, and the CONTRACTS §3 rule (centre = 05:00, snap to the nearest real offset) would give UTC+05:45 (Nepal). A 01:00–09:00 gap is centred on 05:00 exactly and gives UTC+05:30. The profile shows sleep "01:00"–"09:00".
- **`anonymity_set`** = distinct depositors into the rail before the person's *first* one-time wallet was funded (the smallest crowd, so the honest number): 221 for seed 42. Rail users make their first deposit in the first 3 h of 18 Oct.
- **Shield-mode `linkability.total` (238)** can't come from the graph, because nothing links the one-time wallets. Phase 1 will take the owner's own one-time wallets from the session (the person knows which wallets are theirs) to count the total. The profile's `traced` count still comes only from graph linking.
- **Added `fixtures/truth.seed42.shield.json`** (not in the task list): shield tests need ground truth for the one-time wallets.

Contract change request (if any): none.

Later (ideas, not now): none.

## Claude · 28 Oct (Phase 1)
Done:
- `packages/engine/src/analyze.ts`: Rule 1 (`linkFunding`) and Rule 2 (`linkCoactivity`) exactly per CONTRACTS §3, plus `analyze()` = both. No mode parameter; shield and open go through identical code.
  - Rule 2 counts "observed" as payment pairs (one from each wallet) within 90 s; span = the ledger window (`days × 86400`).
- `profile.ts`: `cluster` (walks SAME_OWNER from the seed), `inferTimezone` (48-slot method, snaps to real offsets), `profile()` → `ProfileFacts`.
- `graphView.ts`: `GraphView` around the profile, < 300 nodes.
- Fixtures are now produced by the engine (`pnpm fixtures`). They came out byte-identical to the Phase 0 ground-truth versions, so **Antigravity: nothing changed under you.**
- Gate 1 engine checks are live in `pnpm demo:check`: seed 42 → 4 wallets, UTC+05:30, 5 signals, 238/238; zero false links on seeds 1–4 in both modes. 50 tests green.
- demo:check runs Playwright and `forge test` automatically once `apps/web/playwright.config.ts` / `contracts/foundry.toml` exist.

Next (Phase 2): TigerGraph schema, loader, GSQL queries, `pnpm test:parity`, then API routes with engine fallback.

Blocked on / needs from others:
- **Kalp:** `.env` sits in `~/Desktop/glasshouse/`, outside the repo root. Move it to `glasshouse-kickoff/.env` (already git-ignored).
- **Kalp:** `TG_HOST` holds a 32-character value that looks like a TigerGraph *secret*, not a host URL, and `TG_TOKEN` is empty. Phase 2 needs the workspace host URL plus a secret or token.

Contract change request (if any): possibly `TG_SECRET` in `.env.example`. Savanna issues short-lived tokens from a secret, so the client would exchange the secret for a token itself rather than storing a token. I'll confirm against the Savanna docs at the start of Phase 2 before asking.

Later (ideas, not now): none.

## Claude · 28 Oct (Phase 2)
Done:
- `packages/tigergraph`:
  - `schema.gsql`: Wallet, Payment, Bucket (90 s), TRANSFER, ACTIVE_IN, SAME_OWNER. The open and shield halves live in one graph with ids prefixed by mode.
  - Queries: `link_funding`, `link_coactivity`, `owner_profile`.
  - `client.ts`: TigerGraph 4.x REST, with doc links in the file. `load.ts`: batched upserts, at most 2,000 records per request. `links.ts`.
  - Scripts: `pnpm tg:setup`, `pnpm test:parity`.
  - 13 tests, including a TypeScript replay of the GSQL algorithms over the uploaded records. It gives exactly the engine's links for open and shield.
- `apps/web/app/api`:
  - `GET /api/profile` and `GET /api/graph` read links from TigerGraph and fall back to the engine on `OFFLINE_MODE=true`, missing config, or a TigerGraph error. The `x-glasshouse-links` header says which one answered.
  - `POST /api/narrative`: `claude-opus-5-5` (SDK 1.3.0, low effort, server-side refusal fallback on), facts-only system prompt. It falls back to a deterministic 4-sentence template when there's no key, the call fails, or the model refuses (useful for the offline demo).
  - 9 route tests. Offline API output is byte-identical to the fixtures.
- Engine: Rule 2's lift check now uses integers (`passesLift`) so GSQL and the engine compare the same thing. Fixtures are unchanged.
- `demo:check` Gate 2: the API check is live; parity runs once TG creds are set.

Next: run `pnpm tg:setup` + `pnpm test:parity` against Savanna once creds are fixed. The GSQL hasn't touched a real server yet, so expect small syntax fixes. Then Phase 3.

Blocked on / needs from others:
- **Kalp (TigerGraph):** move `.env` into `glasshouse-kickoff/`. Set `TG_HOST` to the workspace URL. Put the secret → token result into `TG_TOKEN` (README → TigerGraph). Then `pnpm tg:setup && pnpm test:parity`.
- **Antigravity:**
  - The API is live: `/api/profile` and `/api/graph` return the same JSON as `fixtures/profile.*.json` and `fixtures/graph.*.json`, and `/api/narrative` takes `ProfileFacts`.
  - I touched three of your files for wiring only: `apps/web/package.json` (deps `@anthropic-ai/sdk`, `@glasshouse/tigergraph`, vitest; `"test"` runs only `app/api` tests), `next.config.ts` (`transpilePackages` + tigergraph), and removed `app/api/README.md`.
  - Put Playwright under its own script (e.g. `test:e2e`) so `pnpm test` stays fast. `demo:check` runs Playwright via `apps/web/playwright.config.ts`.

Decisions made under ambiguity:
- **Buckets are 90 s, not 2 min.** Each payment is ACTIVE_IN its home bucket and the next, so any two payments within 90 s share a bucket. Each pair is counted once, in bucket max(home), which makes GSQL exact rather than approximate.
- **Payments are vertices.** This avoids multi-edge upserts, whose REST format is poorly documented.
- **The API serves the synthetic seed-42 world.** A wallet outside it gets 404. The demo person's own Shield one-time wallets (from their session) count only toward `linkability.total` and `anonymity_set`, never toward linking.
- **Token, not secret, in `.env`,** per CONTRACTS §6 (`TG_TOKEN`). TigerGraph 4.x tokens last one week by default, so the token must be refreshed weekly (README has the command). The change request to store `TG_SECRET` instead is withdrawn for now; reopen it if refreshing becomes a pain.

Contract change request (if any): none.

Later (ideas, not now): none.

## Claude · 28 Oct (Phase 3)
Done:
- Shield data uses the exact same code path: `analyze` has no mode, and TigerGraph runs the same three queries on the `shield:` half of the graph.
- `pnpm test:parity` now also asserts Gate 3 with TigerGraph's links: shield → 0/238 traced, crowd > 0.
- Engine `oneTimePayments(ledger)`: payments from wallets funded only by a pool (tests only, not linking).
- `pnpm analyze:ledger <ledger.json> <seed> [own,...]` runs any Ledger through analyze + profile and prints a summary. Use it on real testnet exports.
- `demo:check` Gate 3 has three checks:
  - Shield via TigerGraph: runs with parity. The engine already gives 0/238, crowd of 221.
  - Real testnet export: reads `packages/chain/exports/testnet.shield.json`. It must be a valid Ledger with ≥1 payment from a rail-funded wallet, and no link may touch a one-time wallet.
  - UI tx hash: PENDING for Antigravity.
- 53 engine tests green.

Next: Gate 2/3 parity on live TigerGraph once creds are fixed; then Phase 4 (audit, stats, checkout, viaSocket).

Blocked on / needs from others:
- **Kalp:** TigerGraph creds (see the Phase 2 entry). Gate 2 and Gate 3 both wait on `pnpm test:parity`.
- **Codex (Phase 3 export):** write your real Base Sepolia transfers to `packages/chain/exports/testnet.shield.json` as a `Ledger`:
  - Label the Rail contract `kind: "pool"`.
  - Label the x402 test endpoint's pay-to address `kind: "service"` with a `category`.
  - Leave the depositor and one-time wallets unlabelled (`kind: ""`).
  - Check it with `pnpm analyze:ledger packages/chain/exports/testnet.shield.json <depositor> <one-time,...>`, then record the tx hash here.
- **Antigravity:** Gate 3 wants the real testnet tx hash in the UI. It will come from `/api/shield/session` (`funded_tx`) once the relayer exists. Until then, the Shield view can link to the hash Codex records here.

Contract change request (for Kalp, before anyone builds `/api/shield/session`):
- The route needs to reach Codex's relayer, but there's no relayer address in CONTRACTS §6. Proposal: add `RELAYER_URL`; the relayer exposes `POST /release { to } → { tx }`.
- For the live demo payment: the one-time key must stay in memory on the server, so the payment has to happen server-side. Proposal: `POST /api/shield/session` creates the wallet (`newOneTimeWallet`), asks the relayer to fund it, optionally pays one x402 test call with `payX402`, then drops the key. Response: `{ wallet, funded_tx, payment_tx? }`, where `payment_tx` is a new optional field.

Later (ideas, not now): none.

## Claude · 28 Oct (TigerGraph live)
Done:
- Savanna workspace connected (TigerGraph 4.2.5). `.env` is now in the repo root (git-ignored). `TG_TOKEN` is valid until 4 Nov 2026, past the deadline.
- `pnpm tg:setup`: schema created and all 3 queries installed. The GSQL compiled first time.
- **`pnpm test:parity` PASS on live TigerGraph:**
  - open: 151 = 151 links, owner walk = engine.
  - shield: 148 = 148 links, owner walk = engine, **0/238 traced, crowd of 221**.
- The API served through TigerGraph (`x-glasshouse-links: tigergraph`) returns the same open profile as `fixtures/profile.open.json`, and the same graph nodes and edges as `fixtures/graph.open.json`.
- Client robustness for venue Wi-Fi: network failures are retried; 429/499/502/503/504 are retried for upserts and query reads only.
- `demo:check` runs `test:parity --no-load` (about 14 s). Plain `pnpm test:parity` re-uploads both ledgers, about 10 min on this Wi-Fi.
- Gate 2 parity: PASS. Gate 3 TigerGraph shield: PASS.

Gotcha (fixed): the package script was called `setup`, which collides with pnpm's built-in `pnpm setup`. It ran pnpm's global installer instead of our script, and appended a PNPM_HOME block to ~/.zshrc. The script is now `tg:setup`. **Kalp:** remove that block from ~/.zshrc if you don't want it.

Still pending: Antigravity (UI on live API, tx hash in UI), Codex (testnet export).

Contract change request: none. (TG_SECRET is kept in the local `.env` only so the token can be refreshed; no code reads it.)
