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
