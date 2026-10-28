// Frozen interfaces from CONTRACTS.md §2. Do not change without Kalp's approval.

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
