import { expect, test } from "@playwright/test";
import { privateKeyToAccount } from "viem/accounts";

const claimed = privateKeyToAccount(`0x${"42".repeat(32)}`);  // the address the "wallet" shows
const signer = privateKeyToAccount(`0x${"77".repeat(32)}`);   // the key that actually signs: not the owner

test("audit page: a wallet you don't own gets a friendly refusal, no profile", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.exposeFunction("__sign", async (hexMessage: string) =>
    signer.signMessage({ message: { raw: hexMessage as `0x${string}` } }));
  await page.addInitScript((address: string) => {
    // minimal EIP-1193 wallet
    (window as unknown as { ethereum: unknown }).ethereum = {
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [address];
        if (method === "personal_sign") return (window as unknown as { __sign: (m: string) => Promise<string> }).__sign(params![0] as string);
        throw new Error(`unsupported ${method}`);
      },
      on: () => undefined,
      removeListener: () => undefined,
    };
  }, claimed.address);

  await page.goto("/audit");
  await expect(page.getByText("You can only audit a wallet you own")).toBeVisible();
  await expect(page.getByTestId("counter")).toContainText("agent wallets audited");
  await page.getByRole("button", { name: "Connect wallet and audit" }).click();
  await expect(page.getByTestId("audit-error")).toContainText("you can only audit a wallet you own");
  await expect(page.getByText("x402-style payments readable by anyone")).toHaveCount(0);
  await page.screenshot({ path: `test-results/${info.project.name}-audit-refused.png`, fullPage: true });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(wide, "no horizontal scroll").toBe(false);
  expect(errors).toEqual([]);
});

test("audit page: no wallet in the browser → clear instructions", async ({ page }) => {
  await page.goto("/audit");
  await page.getByRole("button", { name: "Connect wallet and audit" }).click();
  await expect(page.getByTestId("audit-error")).toContainText("No wallet found");
});

test("audit page: a wallet with no agent payments gets an honest empty result, not the Shield message", async ({ page }) => {
  const owner = privateKeyToAccount(`0x${"42".repeat(32)}`);
  await page.exposeFunction("__sign2", async (hexMessage: string) => owner.signMessage({ message: { raw: hexMessage as `0x${string}` } }));
  await page.addInitScript((address: string) => {
    (window as unknown as { ethereum: unknown }).ethereum = {
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [address];
        if (method === "personal_sign") return (window as unknown as { __sign2: (m: string) => Promise<string> }).__sign2(params![0] as string);
        throw new Error(`unsupported ${method}`);
      },
      on: () => undefined,
      removeListener: () => undefined,
    };
  }, owner.address);
  // stand-in for the chain read: an empty real-chain profile, exactly what /api/audit returns for such a wallet
  await page.route("**/api/audit", (route) => route.fulfill({ json: {
    mode: "open", seed_wallet: owner.address.toLowerCase(), wallets: [{ addr: owner.address.toLowerCase(), role: "personal" }],
    links: [], identity_anchor: null, timezone: null, hourly: Array(48).fill(0), signals: [],
    spend: { payments: 0, usdc: 0 }, linkability: { traced: 0, total: 0 }, anonymity_set: null, source: "base-mainnet",
  } }));
  await page.goto("/audit");
  await page.getByRole("button", { name: "Connect wallet and audit" }).click();
  await expect(page.getByText("No agent payments found.")).toBeVisible();
  await expect(page.getByText(/rail/i)).toHaveCount(0);
});
