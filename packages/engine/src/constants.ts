import type { Category } from "./types";

// CONTRACTS.md §3 signal thresholds. Engine and GSQL must both use these.
export const SIGNAL_RULES: Record<Category, { min: number; text: string }> = {
  Health: { min: 3, text: "Researching a health problem" },
  Career: { min: 5, text: "Looking for a new job" },
  Travel: { min: 3, text: "Planning a trip" },
  Finance: { min: 2, text: "Sorting out money: taxes or loans" },
  Legal: { min: 1, text: "Dealing with a contract or legal matter" },
  Trading: { min: 5, text: "Actively trading crypto" },
  Developer: { min: 5, text: "Software developer" },
};
