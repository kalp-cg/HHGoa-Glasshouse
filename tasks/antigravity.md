# Task brief: Antigravity (frontend engineer)

## Paste this to start Antigravity (only after Gate 0 is green)
> You are the frontend engineer on Glasshouse. Read `AGENTS.md`, `CONTRACTS.md` and `PLAYBOOK.md` fully. You own everything in `apps/web/` **except** `apps/web/app/api/` (that's Claude's). Do not edit `packages/`, `contracts/` or `services/`. Build against the JSON in `fixtures/` until I tell you the API is live. Use your browser to check every screen visually at desktop, projector (1280×720) and phone (390px) sizes. Do **Phase 1** from `tasks/antigravity.md`, then update `HANDOFF.md`.

---

## Design direction
- The product is called **Glasshouse**: think glass, light, exposure. Clean, calm, high contrast. It must read clearly on a projector from the back of a room.
- Large type for headlines. The hero number ("238 of 238 traced" → "0 of 238 traced") is the most important element on screen.
- Dark and light themes both readable. No tiny grey text for anything that matters.
- Motion only where it tells the story: wallets snapping together into one person; the switch flip; the crowd dissolving the link.

## Phase 1: The demo screen, from fixtures
One page (`/`), top to bottom:
1. **Hero line:** "Your AI agents made 238 paid API calls in the last 10 days. Anyone can trace **all 238** to you." (from `ProfileFacts.linkability`).
2. **Mode switch:** "Pays openly" / "Shield mode". Switching loads `profile.open.json` / `profile.shield.json` and `graph.*.json`.
3. **Graph view** (Cytoscape.js): the person's wallets highlighted, labelled exchanges and services in a neutral style, SAME_OWNER edges visibly different from TRANSFER edges; hover shows the link `detail` (the evidence). Smooth at ~300 nodes.
4. **Profile panel:** "What a stranger can work out about you": identity anchor, time zone + sleep window, each signal with its text and date range, total spend.
5. **Sleep strip:** 48 bars from `hourly`, sleep gap clearly marked, local-time axis.
6. **Shield state:** headline flips to "Anyone can trace **none** of them to you"; graph shows a crowd of one-time wallets; label "could belong to any of N people" from `anonymity_set`.
7. **AI write-up block:** placeholder text now; later from `/api/narrative`.

Write one Playwright smoke test: page loads, switch flips, headline changes from 238 to 0, no console errors.

**Check:** smoke test green; looks right at 1440px, 1280×720 and 390px.

## Phase 2: Switch to the live API
- Replace fixture imports with calls to the routes in CONTRACTS.md §4. Keep a `?fixtures=1` query param that forces fixtures (demo safety).
- Loading and error states that look intentional, never a blank screen.

**Check:** identical visuals with API and with `?fixtures=1`.

## Phase 4: Audit page + launch polish
- `/audit`: connect wallet (use a standard wallet-connect library compatible with viem; read its docs) → request challenge → user signs → POST `/api/audit` → show their own profile with the same components.
- Clear copy: "You can only audit a wallet you own. We never show anyone else's profile."
- Small live counter from `/api/stats`: "N agent wallets audited at Hacker House Goa".
- "Get the pro audit" button → `/api/checkout` → Dodo checkout.
- Open Graph image and title for sharing.

**Check:** full audit flow works on a phone with a real wallet; foreign-wallet error looks friendly.

## Phase 5 (stretch, only after Gate 4)
- Shareable score card: shows only the score ("87% leaking → 0%") and the URL, never private details.

## Out of scope for you
API routes, engine, TigerGraph, contracts, relayer. Need something? Write it in `HANDOFF.md`.
