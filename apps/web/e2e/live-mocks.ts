import type { Page } from "@playwright/test";

// Stand-ins for the live endpoints so browser tests never touch the real chain or the RPC quota.
export async function mockLive(page: Page): Promise<void> {
  await page.route("**/api/live/pulse", (r) => r.fulfill({ json: { block: 51_643_322, seconds: 20, payments: 88, payers: 57, per_minute: 264, at: new Date().toISOString() } }));
  await page.route("**/api/live/real", (r) => r.fulfill({
    headers: { "x-glasshouse-sampled": "true" },
    json: { wallets: 4, time_zone: 1, exchange: 1, linked: 3, signal: 1, around_the_clock: 0, payments: [12, 28, 40, 7], by_time_zone: { "UTC-08:00": 1 }, by_signal: { Trading: 1 }, updated_at: new Date().toISOString() },
  }));
}
