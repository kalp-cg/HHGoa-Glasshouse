# Task brief: Codex (chain engineer)

## Paste this to start Codex (only after Gate 0 is green)
> You are the chain engineer on Glasshouse. Read `AGENTS.md`, `CONTRACTS.md` and `PLAYBOOK.md` fully. You own only `contracts/`, `services/relayer/` and `packages/chain/`. Do not edit any other folder. Before using x402, viem, Foundry or any SDK, read the current official docs and pin versions. Do **Phase 1** from `tasks/codex.md`, stop when its checks pass, and update `HANDOFF.md`.

---

## Phase 1: Contract + wallets (offline, testable)
1. `contracts/` (Foundry): `Rail.sol`
   - `deposit()`: accepts exactly 10 USDC (test token) per call; records the depositor count (for anonymity set).
   - `release(address to)`: only the relayer address may call; sends exactly 1 USDC to `to`.
   - Events: `Deposited(depositor)`, `Released(to)`.
   - Use a mock ERC-20 in tests. Tests: wrong amount reverts, non-relayer release reverts, balances correct, events emitted.
2. `packages/chain/oneTimeWallet.ts`: `newOneTimeWallet()` with viem; key in memory only. Test: addresses are unique and never logged.
3. `packages/chain/verifyOwnership.ts`: verify an EIP-191 signed message with viem. Tests: valid signature → true; wrong signer → false; tampered message → false.

**Check:** `forge test` green; `pnpm --filter chain test` green.

## Phase 3: Shield path on testnet
1. Deploy `Rail.sol` to **Base Sepolia** with a deploy script; write the address to `.env` as `RAIL_ADDRESS` (never commit keys).
2. `services/relayer`: small Node service. On request, creates nothing itself; it receives a fresh wallet address and, after a random delay (configurable, short in demo mode), calls `release(to)`. Logs tx hashes only, never keys.
3. `packages/chain/x402.ts`: `payX402(url, wallet)` using the official x402 client SDK (verify the current package and API in the x402 docs). Pay a test x402 endpoint on Base Sepolia from a one-time wallet. If no public test endpoint exists, stand up a minimal x402 test server inside `services/relayer/test-endpoint` following the official seller docs.
4. Export the resulting real testnet transfers in the `Ledger` format so Claude can run them through the same analysis.

**Check:** at least one real Base Sepolia x402 payment from a one-time wallet, tx hash recorded in `HANDOFF.md`; one-time wallet never sends funds back to the user.

## Phase 4: Real-chain audit
1. `packages/chain/ingestBase.ts`: `fetchAgentTransfers(address, {fromBlock, toBlock})`. Read USDC `transferWithAuthorization` (EIP-3009) related logs on Base mainnet (read-only RPC), join `AuthorizationUsed` and `Transfer` on tx hash, return a `Ledger`. Label these "x402-style payments" (not every EIP-3009 transfer is x402). Keep block ranges small; paginate.
2. Hand over to Claude through `HANDOFF.md` with example output for one wallet you own.

**Check:** given one of our own wallets, returns a valid `Ledger`; no private keys involved.

## Out of scope for you
UI, API routes, TigerGraph, Claude write-up, Dodo, viaSocket. If you need something there, write it in `HANDOFF.md`.
