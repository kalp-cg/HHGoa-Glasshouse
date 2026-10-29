# Glasshouse

AI agents now pay for things on-chain, one API call at a time (x402 on Base). Every payment is public.
Glasshouse shows what a stranger can work out from those payments: which wallets are the same person, the
exchange that likely knows their name, their time zone from when the payments stop at night, and what is
going on in their life. Then one switch, Shield mode, pays from one-time wallets and the same analysis traces nothing.

**Live:** https://glasshouse-eta.vercel.app · Team 0xkalp · Hacker House Goa 2026

## Try it

- **Demo** (`/`): a simulated person whose agents made 238 paid calls. "Pays openly" traces all 238 to them;
  "Shield mode" traces 0, and each payment could belong to any of 221 people. Add `?fixtures=1` to use the saved
  copy with no network.
- **Audit your own agent** (`/audit`): open it in a wallet's browser (MetaMask, Coinbase Wallet), sign one free
  message, and see what that wallet's last day of Base payments gives away. Only the wallet's owner can audit it.
- **Leak alerts**: after an audit, connect Telegram once; you get a message when a new audit finds something new.
- **Real Shield session** (Shield mode → "Run a real Shield session"): a fresh one-time wallet is funded through the
  Rail on Base Sepolia and pays one x402 call. Both transactions link to Basescan.

## How it works

| Part | Where |
|---|---|
| Linking rules, profile, time zone, graph view (pure TypeScript, runs offline) | `packages/engine` |
| The same linking in TigerGraph (GSQL), checked equal to the engine | `packages/tigergraph` |
| Base ingest, x402 client, one-time wallets, signature check | `packages/chain` |
| Rail contract (Solidity, Foundry) | `contracts/` |
| Web app and API (Next.js on Vercel) | `apps/web` |

The API uses TigerGraph for linking and falls back to the engine when `OFFLINE_MODE=true` or TigerGraph is
unreachable (the `x-glasshouse-links` header says which answered).

**Safety rules, in code:** a real wallet's profile goes only to whoever signed for it; usage numbers are totals
(wallets deduped by hash); a real audit is never sent to an outside AI model; anything that signs is testnet-only.

**Known limits:** the 238-payment person is simulated; real audits read one day of history; the Rail's relayer is
trusted (it knows which deposit funded which one-time wallet), so Shield mode is a prototype of the idea, not a
trustless privacy pool.

## Run it locally

Needs Node ≥ 22.12 and pnpm (`corepack enable`). Foundry (`forge`) only for the contract.

```sh
pnpm install
pnpm --filter @glasshouse/web dev   # http://localhost:3000
pnpm test                           # unit tests, every package
pnpm typecheck
pnpm demo:check                     # every gate as PASS / FAIL / PENDING
pnpm --filter @glasshouse/web test:e2e   # browser tests at desktop, projector and phone sizes
```

Copy `.env.example` to `.env` (never commit it). Everything degrades gracefully: without keys the demo still runs
on the engine and the write-up uses a built-in template.

| Task | Command |
|---|---|
| Create the TigerGraph schema and install the queries | `pnpm tg:setup` |
| Check TigerGraph gives exactly the engine's answers (reloads data; add `--no-load` to skip) | `pnpm test:parity` |
| Put 10 test USDC from the relayer into the Rail (Base Sepolia) | `pnpm shield:fund` |
| Save the real testnet Shield transactions as a ledger | `pnpm shield:export` |
| Run any ledger through the analysis | `pnpm analyze:ledger <ledger.json> <wallet>` |

TigerGraph tokens expire after a week: exchange the secret for a new one with
`curl -s -X POST "$TG_HOST/gsql/v1/tokens" -H 'Content-Type: application/json' -d '{"secret": "<secret>"}'`.
