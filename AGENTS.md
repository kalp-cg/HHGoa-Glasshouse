# AGENTS.md (rules for every AI agent on this repo)

You are one of three agents (Claude, Codex, Antigravity) building **Glasshouse** for Team 0xkalp at Hacker House Goa 2026. Kalp is the tech lead and integrator. Read `PLAYBOOK.md` and `CONTRACTS.md` before writing any code.

## What we're building (one paragraph)
Glasshouse shows what an AI agent's on-chain x402 payments reveal about its owner, then makes them private with one switch. "Pays openly" loads payments into TigerGraph, links every wallet that belongs to one person, and builds the profile a stranger could build (identity anchor, time zone from sleep gap, life signals). "Shield mode" tops up the agent from Cake Wallet through a private rail and pays from one-time wallets; the same analysis then traces 0 payments. Builders can audit their own agent wallet after proving ownership with a signature.

## Hard boundaries
1. **Stay in your folders.** See ownership in `CONTRACTS.md`. Need something elsewhere? Add a request to `HANDOFF.md`. Do not edit another agent's files.
2. **CONTRACTS.md is frozen.** Build against it exactly. Never change shapes, route names or thresholds on your own.
3. **No invented APIs.** Before using x402, TigerGraph REST, viem, Dodo, viaSocket or any SDK, read the current official docs, pin the version in package.json, and cite the doc URL in a code comment.
4. **Safety in code:**
   - Never render or return a real person's profile. Real-chain profiles only via `/api/audit` after `verifyOwnership` passes.
   - Real-chain data elsewhere: totals only.
   - Testnet keys only for anything that signs. Never ask for or store a mainnet private key.
   - One-time wallet keys live in memory only; never log or persist them.
   - Secrets only via `.env`; never commit them; never print them in logs.
5. **The AI write-up uses facts only.** `/api/narrative` receives `ProfileFacts` and nothing else.
6. **Tests are the definition of done.** Every function in `packages/*` gets a Vitest test. Every gate in `PLAYBOOK.md` is a runnable command.
7. **Main is always demo-able.** Work on your own branch (`claude/*`, `codex/*`, `ag/*`). Never merge red. Small commits with clear messages.
8. **Determinism.** Synthetic data is seeded; same seed, same output, always.
9. **No scope creep.** Build only what your task file lists for the current phase. Ideas go into `HANDOFF.md` under "Later".
10. **All code is written at the house** (event rule). No copying from earlier projects.

## Engineering standards
- TypeScript strict mode, no `any` without a comment explaining why.
- Pure functions in `packages/engine` (no I/O); I/O at the edges.
- Errors are explicit: `{ error }` with proper HTTP status; no silent catches.
- Keep the UI fast: the graph view must stay smooth at ~300 nodes.
- If something is ambiguous, choose the simplest option that satisfies `CONTRACTS.md` and note it in `HANDOFF.md`.

## End every work session by updating HANDOFF.md
```
## <agent> · <short date>
Done:
Next:
Blocked on / needs from others:
Contract change request (if any):
Later (ideas, not now):
```
