# Glasshouse Build Playbook (for Kalp, Team 0xkalp)

This is how the whole build runs. You are the **tech lead and integrator**. Three agents build in parallel:

| Agent | Role | Owns |
|---|---|---|
| **Claude** (start here) | Lead engineer: data, engine, TigerGraph, API, integration | `packages/engine`, `packages/tigergraph`, `fixtures/`, `apps/web/app/api` |
| **Codex** | Chain engineer: rail contract, relayer, one-time wallets, x402, real-chain ingest, wallet signature check | `contracts/`, `services/relayer`, `packages/chain` |
| **Antigravity** | Frontend engineer: every screen, visual polish, browser testing | `apps/web` (everything except `app/api`) |

---

## 1. Tech stack (final, don't debate it again)

**TypeScript end to end, in one pnpm monorepo. Solidity (Foundry) only for the rail contract.**

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | The x402 client SDK, viem and the wallet tooling are JS/TS-first. One language = all three agents can read each other's code. |
| Repo | pnpm workspaces monorepo | Shared types in one place; one `pnpm test`. |
| Web + API | Next.js (App Router) + React + Tailwind | One deploy (Vercel) for UI and API. |
| Graph UI | Cytoscape.js | Handles a few hundred nodes smoothly. |
| Graph DB | TigerGraph Savanna (or Community Edition in Docker), GSQL over REST | Sponsor; multi-hop linking is the core. |
| Chain | viem; Base Sepolia (testnet) for Shield; Base mainnet read-only for real-data totals | Typed, fast, standard. |
| Agent payments | Official x402 client SDK (verify current package name in the x402 docs before installing) | It's the protocol we're analysing. |
| Contract | Solidity + Foundry | Small, testable, fast. |
| AI write-up | Claude API | Turns graph facts into plain English. |
| Tests | Vitest (TS), Foundry tests (Solidity), Playwright (one smoke test) | Gates are tests, not opinions. |
| Payments / alerts | Dodo Payments (test mode), viaSocket webhook | Sponsors. |

**Why not Rust?** It would only be faster at things that aren't our bottleneck. Our bottleneck is integration speed across 3 agents, and the x402 + wallet ecosystem is TypeScript. Rust would add a second language, slower iteration, and no demo benefit. Senior call: pick the stack that removes friction, not the one that sounds impressive.

---

## 2. The senior-level rules (non-negotiable)

1. **Contracts first, code second.** `CONTRACTS.md` defines every data shape and API route. It is frozen once written. Only Kalp (with Claude) changes it, and every change is announced to all three agents.
2. **Fixtures unblock parallel work.** Claude produces `fixtures/` first (a seeded ledger and two profile JSONs). Antigravity builds the whole UI against fixtures. Codex builds against the ledger format. Nobody waits for anybody.
3. **One source of truth for logic.** `packages/engine` is the reference implementation of the linking rules. TigerGraph GSQL must produce the **same answers** (parity test). The engine is also the offline fallback on stage.
4. **Directory ownership.** Each agent writes only inside its owned folders. Need a change elsewhere? Write a note in `HANDOFF.md`; the owner does it.
5. **Main is always demo-able.** Each agent works on its own branch. Merge only when that phase's gate tests pass. Never merge red.
6. **Gates, not vibes.** A phase is done only when its gate checks pass. If you can't prove it with a command, it isn't done.
7. **Cut scope, never the core demo.** Stretch features start only after Gate 4 is green.
8. **Safety rules are code, not slides.** No real person's profile, ever. Real-chain audits only with a valid wallet signature. Real data shown only as totals. Testnet keys only. Secrets live in `.env`, never committed.
9. **Verify, don't assume.** Before using any SDK or API (x402, TigerGraph REST, Dodo, viaSocket), the agent reads the current official docs and pins the version. No invented function names.
10. **House rule:** every line of code is written at Hacker House Goa.

---

## 3. How the build flows: phases and gates

Work moves phase by phase. Agents can run ahead inside their own folders, but **nothing merges past a gate that isn't green.**

### Phase 0: Foundation (Claude leads; others wait for its output)
- Monorepo scaffold, `CONTRACTS.md` types as code in `packages/engine/src/types.ts`.
- Seeded synthetic ledger generator, and committed fixtures: `fixtures/ledger.seed42.json`, `fixtures/profile.open.json`, `fixtures/profile.shield.json`.

**Gate 0:** `pnpm install && pnpm test` passes on a fresh clone. Fixtures are committed and match the types. → Now start Codex and Antigravity.

### Phase 1: The attack works offline (all three in parallel)
- Claude: linking rules + profile in `packages/engine`.
- Antigravity: graph view, profile panel, sleep strip, mode switch, all from fixtures.
- Codex: Rail contract + Foundry tests; one-time wallet generator.

**Gate 1:**
- Engine on seed 42: "You" links exactly **4 wallets**, time zone **UTC+05:30**, **5 life signals**, linkability **238/238**.
- **Zero false links** across seeds 1, 2, 3, 4 (checked against ground truth).
- UI renders both fixtures with no console errors (Playwright smoke test).
- Rail contract tests green.

### Phase 2: TigerGraph parity + live API
- Claude: schema, loader, GSQL queries, API routes that read from TigerGraph and fall back to the engine.

**Gate 2:** `pnpm test:parity` shows TigerGraph output == engine output for seed 42. API returns valid `ProfileFacts`. UI switched from fixtures to the API with no visual change.

### Phase 3: The fix works
- Codex: rail deployed on Base Sepolia; relayer funds a fresh wallet per session; agent pays a test x402 endpoint from it.
- Claude: Shield-mode ledger flows through the same analysis.
- Antigravity: crowd view, "could belong to any of N people".

**Gate 3:** Shield mode shows **0/238 traced** using the same queries. At least one real testnet x402 payment from a one-time wallet, with its tx hash shown in the UI.

### Phase 4: Live with real users
- Codex: signature-gated audit (challenge + verify) and real Base ingest for one wallet.
- Claude: `/api/audit` wiring, usage counter, Claude write-up, Dodo checkout, viaSocket alert.
- Antigravity: audit page, mobile layout, launch polish.

**Gate 4:** Deployed public URL. A wallet you own passes the signature check and gets its audit; a wallet you don't own is rejected. Usage counter increments. Dodo checkout opens in test mode. → **Launch it in the house.** Get real teams to audit their agents.

### Phase 5: Demo hardening
- Offline mode switch (engine fallback) works with Wi-Fi off.
- Full 3-minute demo rehearsed; backup video recorded.
- Stretch only now: shareable score card, real-chain totals page.

**Gate 5:** Demo runs end to end twice in a row with Wi-Fi off and on. Submitted before Sat 31 Oct, 9:59 AM.

---

## 4. How to know it's going well (your dashboard)

Check these, in this order, whenever you're unsure:

- **Green:** last gate's tests pass on main; main deploys; you can run the demo from main right now.
- **Yellow:** an agent is blocked waiting for another (fix: give it fixtures or a mock), or a test is flaky (fix it before new features).
- **Red:** someone is working on a stretch feature before Gate 4; CONTRACTS.md changed silently; the demo hasn't run end to end recently; secrets in git.

Run `pnpm demo:check` (Claude builds it in Phase 0) which prints every gate as PASS or FAIL. That's your single source of truth.

---

## 5. How to work with three agents (your loop)

1. **Start Claude only** with `tasks/claude.md`. Wait for Gate 0.
2. Start **Codex** with `tasks/codex.md` and **Antigravity** with `tasks/antigravity.md`.
3. Each agent ends every work session by updating `HANDOFF.md`: what's done, what's next, what it needs from others.
4. You read `HANDOFF.md`, resolve conflicts, and merge branches that pass their gate.
5. If two agents need the same file changed: the owner changes it. Never both.
6. Before each merge, run `pnpm test && pnpm demo:check`.

---

## 6. Definition of done (the product)

- A public URL where a builder signs with their wallet and sees what their agent leaks.
- The demo: Pays openly → profile → flip → Shield → **0 traced**.
- Real usage numbers from HHGoa teams, recorded honestly.
- TigerGraph does the linking; Cake Wallet tops up Shield mode; Dodo sells the pro audit.
