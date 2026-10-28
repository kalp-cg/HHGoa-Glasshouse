# CONTRACTS.md (frozen interfaces)

Every agent builds against these shapes. **Do not change this file without Kalp's approval.** If you need a change, write it in `HANDOFF.md` under "Contract change request".

These types live as code in `packages/engine/src/types.ts` and are imported by everyone.

---

## 1. Repo layout and ownership

```
glasshouse/
  AGENTS.md  CLAUDE.md  CONTRACTS.md  PLAYBOOK.md  HANDOFF.md
  package.json  pnpm-workspace.yaml  .env.example
  fixtures/                    # Claude   (committed test data, read by all)
  packages/engine/             # Claude   (types, simulate, analyze, dossier)
  packages/tigergraph/         # Claude   (schema.gsql, queries/*.gsql, load.ts, client.ts)
  packages/chain/              # Codex    (oneTimeWallet, x402 client, ingest-base, verifySignature)
  contracts/                   # Codex    (Foundry: Rail.sol + tests + deploy script)
  services/relayer/            # Codex    (Node service: funds one-time wallets)
  apps/web/app/api/            # Claude   (all API route handlers)
  apps/web/ (everything else)  # Antigravity (pages, components, styles, Playwright)
```

---

## 2. Core types

```ts
export type Address = `0x${string}`;
export type WalletKind = "" | "exchange" | "service" | "pool";
export type Category = "Health" | "Career" | "Travel" | "Finance" | "Legal" | "Trading" | "Developer";

export interface WalletInfo {
  addr: Address;
  kind: WalletKind;          // "" = unknown/unlabelled
  label: string;             // e.g. "Exchange A", "SymptomCheck API"; "" if unknown
  category: Category | null; // only for kind === "service"
}

export interface Transfer {
  tx: string;                // tx hash (synthetic: deterministic fake hash)
  from: Address;
  to: Address;
  amount: number;            // USDC, decimal
  ts: number;                // unix seconds, UTC
}

export interface Ledger {
  seed: number;
  start_ts: number;
  days: number;
  wallets: WalletInfo[];
  transfers: Transfer[];
}

// Ground truth: used ONLY by tests, never loaded into the graph or shown in the UI.
export interface GroundTruth {
  owners: Record<string, Address[]>;   // owner id -> wallets; "you" is the demo person
}

export type LinkRule = "funding" | "co-activity";

export interface SameOwnerLink {
  a: Address;
  b: Address;
  rule: LinkRule;
  detail: string;            // human evidence, e.g. "topped up 25 USDC", "same 2 minutes on 4 days"
}

export interface Signal {
  category: Category;
  count: number;
  first_ts: number;
  last_ts: number;
  text: string;              // e.g. "Researching a health problem"
}

export interface ProfileFacts {
  mode: "open" | "shield";
  seed_wallet: Address;
  wallets: { addr: Address; role: "personal" | "agent" | "one-time" }[];
  links: SameOwnerLink[];
  identity_anchor: { exchange_label: string } | null;
  timezone: { offset_minutes: number; label: string; sleep_start_local: string; sleep_end_local: string } | null;
  hourly: number[];          // exactly 48 numbers: payments per 30-min slot of the day, UTC
  signals: Signal[];
  spend: { payments: number; usdc: number };
  linkability: { traced: number; total: number };
  anonymity_set: number | null;   // shield mode only: "could belong to any of N people"
  source: "synthetic" | "base-mainnet";
}

export interface GraphView {
  nodes: { id: Address; label: string; kind: WalletKind | "one-time"; owned: boolean }[];
  edges: { source: Address; target: Address; type: "TRANSFER" | "SAME_OWNER"; label: string }[];
}
```

---

## 3. Profile thresholds (engine and GSQL must both use these)

| Category | Payments needed | Text |
|---|---|---|
| Health | 3 | Researching a health problem |
| Career | 5 | Looking for a new job |
| Travel | 3 | Planning a trip |
| Finance | 2 | Sorting out money: taxes or loans |
| Legal | 1 | Dealing with a contract or legal matter |
| Trading | 5 | Actively trading crypto |
| Developer | 5 | Software developer |

**Rule 1, funding link:** unlabelled wallet sends USDC to another unlabelled wallet → same owner. Never link through labelled wallets.
**Rule 2, co-activity link:** two unlabelled agent wallets pay services within 90 s of each other, in ≥4 distinct 10-minute sessions, over ≥3 distinct days, and ≥20× more often than chance (expected = payments_A × payments_B × 180 s ÷ time span).
**Time zone:** count payments per 30-min UTC slot (48 slots); find the longest run of empty slots (5–15 h); assume its centre is 05:00 local; snap to the nearest real offset. Requires ≥15 payments, else `timezone: null`.

---

## 4. API routes (owned by Claude, consumed by Antigravity)

| Route | Request | Response |
|---|---|---|
| `GET /api/graph?wallet=0x..&mode=open\|shield` | | `GraphView` |
| `GET /api/profile?wallet=0x..&mode=open\|shield` | | `ProfileFacts` |
| `POST /api/narrative` | `ProfileFacts` | `{ text: string }` (4 sentences, facts only, "likely" for inferences) |
| `POST /api/audit/challenge` | `{ address }` | `{ message: string, nonce: string, expires_at: number }` |
| `POST /api/audit` | `{ address, signature, nonce }` | `ProfileFacts` (source "base-mainnet") or `401` if signature invalid |
| `GET /api/stats` | | `{ audits: number, leaking_timezone: number }` (totals only) |
| `POST /api/shield/session` | `{ owner_hint?: string }` | `{ wallet: Address, funded_tx: string }` |
| `POST /api/checkout` | `{ plan: "pro-audit" }` | `{ url: string }` (Dodo checkout) |

All errors: `{ error: string }` with a proper HTTP status. The demo person's wallet is `fixtures/profile.open.json -> seed_wallet`.

---

## 5. Codex ↔ Claude interfaces (packages/chain)

```ts
export function newOneTimeWallet(): { address: Address; privateKey: `0x${string}` }; // key kept in memory only
export function verifyOwnership(address: Address, message: string, signature: `0x${string}`): Promise<boolean>;
export function fetchAgentTransfers(address: Address, opts: { fromBlock: bigint; toBlock: bigint }): Promise<Ledger>; // Base mainnet, x402-style USDC payments
export function payX402(url: string, wallet: { privateKey: `0x${string}` }): Promise<{ tx: string; status: number }>;
```

## 6. Environment variables (`.env.example`)

```
TG_HOST=  TG_TOKEN=  TG_GRAPH=Glasshouse
ANTHROPIC_API_KEY=
BASE_RPC_URL=  BASE_SEPOLIA_RPC_URL=
RAIL_ADDRESS=  RELAYER_PRIVATE_KEY=     # testnet only, never mainnet
DODO_API_KEY=  VIASOCKET_WEBHOOK_URL=
OFFLINE_MODE=false                      # true = API uses packages/engine instead of TigerGraph
```
