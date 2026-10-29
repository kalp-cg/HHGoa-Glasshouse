// Maps an x402 service description to one of the CONTRACTS.md categories, conservatively: a category only when its
// words clearly appear, null otherwise. Generic plumbing ("health check", "ping", "uuid") is Developer, never Health.
import type { Category } from "./types";

const RULES: [Category, RegExp][] = [
  ["Developer", /\b(health ?check|ping|uuid|server time|code|github|repo|compiler|debug|lint|api key|webhook|json|regex|docs?|sdk|deploy|llm|embedding|scrap(e|ing)|crawl|ocr|screenshot)\b/i],
  ["Health", /\b(symptoms?|medical|medicine|doctor|clinic|diagnos\w*|patient|disease|drug|prescription|nutrition|fitness|mental health|therapy|wellness)\b/i],
  ["Career", /\b(jobs?|resume|cv|career|salary|hiring|recruit\w*|interview|linkedin)\b/i],
  ["Travel", /\b(flights?|hotels?|travel|trip|visa|airline|airport|booking|itinerary)\b/i],
  ["Legal", /\b(legal|lawyer|law|contract review|compliance|terms of service|gdpr|lawsuit)\b/i],
  ["Finance", /\b(tax|taxes|loan|mortgage|credit score|budget|invoice|accounting|bank)\b/i],
  ["Trading", /\b(tokens?|price|prices|trading|trade|swap|dex|defi|market|portfolio|whale|memecoin|ohlc|chart|liquidity|yield|airdrop)\b/i],
];

export function categorize(description: string): Category | null {
  for (const [category, re] of RULES) if (re.test(description)) return category;
  return null;
}
