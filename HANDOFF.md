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

## Codex · 28 Oct (Phase 1)
Done:
- Created branch `codex/phase-1` from `claude/phase-0` because `main` did not contain `packages/engine`.
- Added `contracts/src/Rail.sol`, a mock-token Foundry test suite, and `contracts/foundry.toml`. Deposits request exactly 10 USDC (6 decimals), count unique depositors, and releases are relayer-only for exactly 1 USDC.
- Implemented `newOneTimeWallet()` and EIP-191 `verifyOwnership()` with viem 2.57.2. Kept the Phase 3/4 chain functions as explicit stubs.
- `pnpm install` completed; `pnpm --filter @glasshouse/chain test` (5 tests), `pnpm test` (82 tests), `pnpm typecheck`, and `git diff --check` passed.
- `pnpm demo:check` passed Gates 0–3 checks except the Rail test, which failed because `forge` is not installed. Other later phase items remain PENDING as expected.

Next:
- Install Foundry after Kalp approves it, run `forge test --root contracts`, then rerun `pnpm demo:check` and confirm the Rail PASS. No Foundry install approval has been received yet.

Blocked on / needs from others: Kalp: approve or decline Foundry installation, as required by AGENTS.md.
Contract change request (if any): none.
Later (ideas, not now): none.

## Codex · 28 Oct (overnight Phase 4 / Phase 3)
Done:
- Implemented `packages/chain/src/ingestBase.ts`: Base mainnet USDC outgoing EIP-3009 transfers matched to `AuthorizationUsed` by transaction hash, ordinary inbound USDC transfers, lowercased unknown wallets, block timestamps, 500-block pagination, and retries. Added a recorded log fixture and the `ingest` CLI summary.
- Implemented the official x402 Fetch client path, a Base Sepolia relayer HTTP service, `DeployRail.s.sol`, and the `release(address(0))` guard/test.
- Isolated recorded-ledger fixture verification passed: `packages/chain/node_modules/.bin/vitest run test/ingestBase.test.ts` → 2 tests passed.

Untested / blocked:
- The x402 SDK and relayer dependencies are declared at exact versions, but could not be installed or linked. pnpm 12 fails every install attempt with `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK` / `Read-only file system`, including with `--store-dir=/tmp/glasshouse-pnpm-store`. Therefore `pnpm test` and `pnpm typecheck` are not green, x402/relayer tests have not run, and no commits were made (the task requires green gates at every commit).
- Foundry is absent as instructed; `Rail.sol`, the new zero-address test, and deploy script have not been run with Forge.
- The required real-wallet ingest example could not be completed. `https://mainnet.base.org` returned `request limit reached` for `eth_getLogs` even for a one-block USDC `AuthorizationUsed` query, so no payer or totals are claimed. No transaction was sent.

Next (morning commands for Kalp):
1. Install Foundry per the official guide: `curl -L https://foundry.paradigm.xyz | bash && foundryup` ([Foundry installation](https://www.getfoundry.sh/)).
2. From the repo root, run `pnpm install --no-frozen-lockfile` to refresh the lockfile and link the declared dependencies, then `pnpm test && pnpm typecheck`.
3. Run `forge test --root contracts`.
4. Load the local testnet-only `.env` without printing it: `set -a; source .env; set +a`. Derive the relayer address with `export RELAYER_ADDRESS="$(cast wallet address --private-key "$RELAYER_PRIVATE_KEY")"`. Fund it with Base Sepolia ETH from a faucet, then verify the balance with `cast balance "$RELAYER_ADDRESS" --rpc-url "$BASE_SEPOLIA_RPC_URL"`. If sending from a separate testnet funder, use `cast send "$RELAYER_ADDRESS" --value 0.01ether --private-key "$FUNDER_PRIVATE_KEY" --rpc-url "$BASE_SEPOLIA_RPC_URL"`.
5. Deploy from the repo root with `cd contracts && forge script script/DeployRail.s.sol:DeployRail --rpc-url "$BASE_SEPOLIA_RPC_URL" --broadcast`; copy the emitted Rail address into ignored `.env` as `RAIL_ADDRESS`.
6. Obtain Base Sepolia USDC for a separate testnet funder, then seed the Rail pool: `cast send 0x036CbD53842c5426634e7929541eC2318f3dCF7e "approve(address,uint256)" "$RAIL_ADDRESS" 10000000 --private-key "$FUNDER_PRIVATE_KEY" --rpc-url "$BASE_SEPOLIA_RPC_URL"` followed by `cast send "$RAIL_ADDRESS" "deposit()" --private-key "$FUNDER_PRIVATE_KEY" --rpc-url "$BASE_SEPOLIA_RPC_URL"`.

Blocked on / needs from others: writable pnpm store lock behavior; a non-rate-limited Base RPC or a later retry window; then repeat install, full tests/typecheck, Foundry tests, and real payer ingest before committing.
Contract change request (if any): none.
Later (ideas, not now): none.

## Claude (integrator) · 28 Oct night, on Codex's overnight work
- The pnpm store lock was Codex's sandbox (read-only store), not the repo. I installed outside the sandbox: all deps link.
- Two test fixes in `packages/chain/test/x402.test.ts`:
  - The mocked 402 asked for Base mainnet (`eip155:8453`), but `payX402` only registers Base Sepolia. That's correct (testnet only), so the test now uses `eip155:84532`.
  - The SDK retries with a `Request` object, so the header check reads it from there.
- Now green: `pnpm test` (engine 53, chain 7, tigergraph 15, relayer 2, web 9) and `pnpm typecheck`.
- Still untested: Forge (Foundry not installed), the live Base ingest (public RPC rate-limited `eth_getLogs`), and any real transaction (relayer wallet unfunded).

## Claude · 29 Oct, overnight (integrator)
State of `main` (`pnpm demo:check`): **13 PASS · 1 FAIL · 5 PENDING**. All 99 unit tests and 12 Playwright tests (3 screen sizes) are green.

Done tonight:
- **Codex (Phase 3/4 code):** Base USDC ingest, x402 client, relayer service, Rail deploy script, zero-address guard. I integrated it:
  - deps installed outside Codex's sandbox
  - two test fixes (Base Sepolia network; headers read from a `Request`)
- **Demo UI (Phase 1/2/3), built by Claude because headless Antigravity was blocked:**
  - `/`: hero with the giant traced number, mode switch, Cytoscape graph (you / services / crowd rings, evidence on hover), profile panel, sleep strip on local time, write-up, Shield crowd, and a "Run a real Shield session" panel with Basescan links.
  - `?fixtures=1` works. Playwright smoke at 1440, 1280×720 and 390.
- **Phase 4 API:**
  - `/api/audit/challenge` and `/api/audit`: single-use 5-minute nonce bound to the wallet; EIP-191; 401 for a foreign wallet; real-chain sellers labelled as services of unknown category.
  - `/api/stats`: totals only, deduped by hashed wallet.
  - `/api/checkout` (Dodo), `/api/shield/session` (relayer + optional x402 payment).
  - Telegram leak alerts via viaSocket: `/api/viasocket/*`, opt-in, chat picked from a list.
  - Store: Upstash REST, or a local file.
- **`/audit` page:** browser wallet via viem, sign, own profile, live counter, pro audit button, Telegram alerts. Playwright: foreign wallet refused politely; no-wallet message.
- **CONTRACTS §7** records the changes Kalp approved before bed.
- **viaSocket skill run:**
  - check script `0 FAIL, 2 WARN` (the WARNs are the checker failing to resolve the `telegram` slug; ids verified live with `versionIdFor`).
  - Progress events sent to viaSocket, step names only.
  - Bug found: the docs say slug `telegram-bot`, but the real slug is `telegram`.

UNTESTED, and why:
- `forge test` / Rail deploy: installing Foundry was blocked by my safety checks (external install script).
- Telegram `list-messages` and `send-message` on a real connection: no test bot connected yet.
- Live Base audit: `https://mainnet.base.org` and PublicNode both refuse `eth_getLogs` ("request limit reached" / "invalid params"). Needs a provider RPC.
- Shield session on testnet: relayer wallet unfunded; Rail not deployed.
- Antigravity didn't run: headless `agy` needs "skip all permissions", which my safety checks refused.

**Kalp's morning list (in order):**
1. **Foundry:** `curl -L https://foundry.paradigm.xyz | bash && foundryup`, then `forge test --root contracts`. That's the only FAIL.
2. **Base RPC for real audits:** alchemy.com → new app → Base Mainnet → copy the HTTPS URL into `.env` as `BASE_RPC_URL=`. Then audit your own agent wallet on `/audit`.
3. **Fund the relayer** `0x7362B05CC0f89a093A235E4f2C3B63328E9d845F`: Base Sepolia ETH (portal.cdp.coinbase.com → Faucets) and test USDC (faucet.circle.com).
   Then deploy the Rail (Codex's HANDOFF steps 4–6) and set `RAIL_ADDRESS`. Run `pnpm --filter relayer start` and set `RELAYER_URL=http://localhost:8787`.
4. **Telegram test bot:** @BotFather → `/newbot`. Connect it at https://flow.viasocket.com/integrations/83861/projBWngose4/apps-api, then send the bot "hi". I'll then run `list-messages` and `send-message` once for real.
5. **Dodo:** test-mode API key and a "Pro audit" product → `DODO_API_KEY=`, `DODO_PRODUCT_ID=`.
6. **Vercel:** create a token → `VERCEL_TOKEN=`, so I can deploy (root dir `apps/web`) and copy the env vars across. Add Upstash from Vercel → Storage for the production store.
7. **Anthropic key** (optional): `ANTHROPIC_API_KEY=` for real write-ups. The template works without it.
8. Optional: remove the `# pnpm … # pnpm end` block from `~/.zshrc` (from the `pnpm setup` mix-up).

## Claude · 29 Oct, morning
Done:
- **Foundry installed by Kalp (`foundryup`) and finished by me: `forge test --root contracts` → 6/6 pass.** `demo:check` now finds `~/.foundry/bin` itself.
- **Bug found in Codex's ingest:** the Base USDC constant had 39 hex digits (one character dropped), so every Base log query was invalid. Fixed (`packages/chain/src/constants.ts`, verified on chain: `symbol() = USDC`) with a regression test.
- **Alchemy (Base mainnet + Base Sepolia) enabled and set in `.env`.** The free plan allows `eth_getLogs` over only 10 blocks, so `fetchAgentTransfers` now uses `alchemy_getAssetTransfers` on Alchemy URLs (`packages/chain/src/ingestAlchemy.ts`):
  - no block-range limit
  - x402-style payments = outgoing USDC transfers whose transaction was submitted by someone else (the facilitator pays the gas)
  - busy wallets: sender lookups are sampled (max 300), which took a 6,000-transfer payer from 257 s to 14.5 s
  - 429s are retried with backoff
  - Tested live on real Base data: 137 authorizations from 67 payers in 10 blocks, full profile from a real payer.
- Relayer wallet funded with 0.0002 Base Sepolia ETH; USDC still to come.

Needs Kalp:
- **TigerGraph workspace auto-paused** ("Auto start is not enabled for this workspace"). Resume `MyWorkspace` at tgcloud.io (Workspace → Actions) and, if offered, turn on auto-start. Data persists. Until then the API uses the engine (`OFFLINE_MODE` behaviour), and `demo:check` shows parity FAIL because TigerGraph is unreachable, not because the answers differ.
- Test USDC for `0x7362B05CC0f89a093A235E4f2C3B63328E9d845F` (CDP faucet → Base Sepolia → USDC).

## Claude · 29 Oct, Telegram alerts verified on a real connection
- Test bot connected (viaSocket test user `apps-api-test-user`). Both actions ran for real through the app's own code:
  - `list-messages` returns a bare array of Telegram updates; the chat is read from `message.chat`.
  - `send-message` sent the leak alert to Kalp's Telegram; an identical second audit sent nothing (dedupe works).
- Real response shape saved as a unit test. viaSocket skill "Finished when" lines all hold; `finished: ok` sent.

## Claude · 29 Oct, deployed
- **Public URL: https://glasshouse-eta.vercel.app** (Vercel project `glasshouse`, team kalp-cgs-projects, root `apps/web`, Node 22, auto-deploys from GitHub `main`). Live checks: `/`, `/audit`, `/api/stats`; `/api/profile` answers through **TigerGraph** (`x-glasshouse-links: tigergraph`) in ~1 s.
- Env vars set on Vercel (encrypted): TigerGraph, Alchemy Base RPCs, viaSocket, Dodo key, SESSION_SECRET, etc. Not sent: `RELAYER_PRIVATE_KEY`, `TG_SECRET`.
- Fixes found while deploying: TigerGraph timeout raised to 20 s (cold function), route budget 30 s, 60 s engine fallback after a TigerGraph failure, explicit 503 when the shared store is missing.
- Still needed on Vercel: **Upstash** REST URL + token (audits need a shared store; `/api/audit/challenge` returns 503 until then) and **`DODO_PRODUCT_ID`**. Add to `.env`; I copy them to Vercel and redeploy.
- TigerGraph token expires **4 Nov**. Refresh: README → TigerGraph step 2, then update `TG_TOKEN` on Vercel.
- Kalp: rotate the Vercel token and the Alchemy key after the demo (both were pasted into chat).

## Claude · 29 Oct, Upstash + live audit proven
- Upstash Redis connected (local `.env` and Vercel), site redeployed. **Gate 4 on the live URL, with real signatures:** foreign signature → 401; owner's → own profile from real Base data in 0.8 s with a session cookie; reused nonce → 401. The test audit was counted, so the counters were reset to zero (live store is empty, usage numbers are honest).
- AI write-up: Anthropic is **not** needed. Provider order: `GROQ_API_KEY` (free) → `ANTHROPIC_API_KEY` → built-in template. viaSocket's "Run AI Model" worked but its upstream model credits are exhausted (reported to viaSocket as a problem event).
- **Privacy rule in code:** a real person's audit (`source: "base-mainnet"`) never goes to an outside model; only the synthetic demo profile does.
- Tests are hermetic (they blank the Upstash/LLM settings and can't touch the live store).
- Still open: `DODO_PRODUCT_ID` (checkout), testnet USDC for the relayer (Shield payment + Gate 3), optional `GROQ_API_KEY`.

## Claude · 29 Oct, Groq write-up live
- `GROQ_API_KEY` set (local + Vercel). Default model `openai/gpt-oss-120b` with `reasoning_effort: low` (without it the model spends all tokens thinking and answers nothing). A field glossary in the prompt keeps Shield mode accurate ("none can be traced; could belong to any of 221 people"). Live: demo profiles → Groq (~2 s warm); a real-chain profile → template only (verified in production).
- `.env`: there are no longer two. `~/Desktop/glasshouse/.env` is now a symlink to `glasshouse-kickoff/.env` (mode 600). Backups of both old files are in the session scratchpad only.
- Left to fill in `.env`: `DODO_PRODUCT_ID` (checkout) and test USDC for the relayer (Gate 3).

## Claude · 29 Oct, Shield ready on Base Sepolia (waiting for USDC)
- **Rail deployed** to Base Sepolia: `0x2c9c4b8ec4454d0d58450892bbd8b34a8386897b` (tx `0xeae65401…0640`). Verified on chain: `usdc()` = Circle Base Sepolia USDC, `relayer()` = our relayer wallet.
- **`/api/x402/demo`**: a real x402 endpoint (0.01 USDC on Base Sepolia via the x402.org facilitator, pay-to `X402_PAY_TO`). Live: unpaid request → HTTP 402.
- **`/api/shield/session`**: when no `RELAYER_URL` is set (the deployed site cannot reach a relayer on a laptop), the route releases from the Rail itself with the testnet relayer key. Then it waits for the funding and pays `/api/x402/demo` once from the new one-time wallet. Capped at 10 sessions/hour (Upstash). Live: answers "the Rail is empty" until it is funded.
- The testnet relayer key is now also on Vercel (encrypted) so the live site can release. It holds only free test tokens.
- Scripts:
  - `pnpm shield:fund`: approve + deposit 10 test USDC from the relayer into the Rail.
  - `pnpm shield:export`: writes the real testnet ledger to `packages/chain/exports/testnet.shield.json` for Gate 3.
- Playwright checks the Shield panel renders the transaction hashes as Basescan links (Gate 3 "tx hash shown in the UI").
- **To finish Gate 3 the moment the relayer has USDC:** run `pnpm shield:fund`, click "Run a real Shield session" on the live site, then `pnpm shield:export` and `pnpm demo:check`.

## Claude · 29 Oct, all gates green (17/17 in `pnpm demo:check`)
- **Gate 3: real Shield session on the live site, verified on chain (Base Sepolia):**
  - funding: Rail → one-time wallet `0x9de6…3393`, 1 USDC, tx `0x8880946f…6e44`, submitted by our relayer
  - x402 payment: one-time wallet → x402 test service, 0.01 USDC, tx `0x7603a7f8…0883`, submitted by the x402.org facilitator (the one-time wallet needed no ETH)
  - `packages/chain/exports/testnet.shield.json` holds the real ledger; analysis links nothing to the one-time wallet.
- **Gate 4:** `DODO_PRODUCT_ID` set (local + Vercel). The live `/api/checkout` creates a Dodo test-mode checkout session; `demo:check` now calls it for real.
- Honest caveat: the faucet gave 1 USDC, but `Rail.deposit()` takes exactly 10. I sent the 1 USDC to the Rail with a plain transfer to run this session. For the proper deposit flow (and a non-zero `depositorCount`), get 10+ test USDC (faucet.circle.com gives 20), then run `pnpm shield:fund`.
- Rotate after the demo (all were pasted into chat): Vercel token, Alchemy key, Upstash token, Groq key, Dodo key, viaSocket embed secret, TigerGraph secret.

## Claude · 29 Oct, product review fixes
Reviewed the whole product for simplicity and correctness; fixed:
- **Empty real wallet**: the audit showed the Shield "rail" message (and the template write-up told the rail story). It now says plainly that no agent payments were found.
- **Exchange taken for "your wallet"** in real audits: a funder that has sent 1,000+ transactions is labelled as the likely exchange, so it becomes the identity anchor instead of being linked to the person (one `eth_getTransactionCount` per funder, at most 20).
- Identity wording is now "likely knows your real name" (it is an inference).
- The counter counts only wallets with at least one agent payment, so throwaway wallets can't inflate it.
- Signed audits are capped per hour (`AUDITS_PER_HOUR`, default 60) to protect the RPC quota.
- Groq write-ups are cached per distinct profile (server) and per visit (browser); the demo's profile and graph get CDN cache headers.
- Removed the unused Anthropic path and `@anthropic-ai/sdk` (Groq or the template only).
- The mode switch is two toggle buttons (`aria-pressed`) instead of a half-implemented radio group.
- README rewritten for the finished product.
- Tests: 110 unit, 18 browser; `demo:check` 17/17.

## Claude · 29 Oct, real data sandbox (public Base data, totals only)
Asked for a sandbox on public data instead of someone's real wallet. Built:
- `pnpm real:services` → `fixtures/x402-services.base.json`: x402 service pay-to address → category, from Coinbase's public x402 list ("Bazaar"). 351 Base services seen in a 4,000-listing sample; 222 categorized (engine `categorize`, conservative, tested). Services only, no payers.
- Engine `labelRealChain` (tested), shared by the real audit and the snapshot: paid wallets become services with their public category, so real audits can now show life signals; a funder with 1,000+ sends becomes the likely exchange.
- `pnpm real:totals` → `fixtures/real-base-totals.json`: samples x402-style payers from 30 ten-block windows over the last 24 h on Base mainnet, analyses each wallet in memory, and saves totals only (checked: no address in the file).
  - First snapshot: 1,200 payers seen, 30 analysed. 30% give away a time zone (mostly UTC-08:00), 67% linked to another wallet, 13% show a life signal (Trading, Developer), 7% funded from an exchange-like wallet, 7% pay around the clock, median 28 calls/day.
- `/real` page shows the snapshot; a browser test fails if anything shaped like an address ever appears on it. Tests: 123 unit, 21 browser.

## Claude · 29 Oct, live and reviewer-ready
- **Live x402 pulse** (`/api/live/pulse`): x402-style payments in the latest 10 Base blocks (~20 s), cached 20 s so any number of viewers cost one RPC call. First reading: 88 payments from 57 wallets in 20 s (~264/min).
- **Live growing sample** (`/api/live/real`): while anyone has `/real` or the tour open, the server analyses one more real payer every 2 minutes (a store lock shared by all viewers) and folds it into running totals. Only a hash per wallet is kept (no double counting); a test checks no address reaches the store.
- **`/tour`**: a 7-screen reviewer walkthrough (← → or click, projector-sized). Live pulse → simulated person 238/238 → Shield 0/238 → the real Base Sepolia transactions (Basescan links) → live real-wallet totals → QR code to `/audit`.
- Browser tests stand in for the live endpoints (and point `BASE_RPC_URL` nowhere) so tests never use the RPC quota. Tests: 125 unit, 24 browser (one worker).
