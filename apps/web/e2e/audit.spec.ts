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

const emptyProfile = (addr: string) => ({
  mode: "open", seed_wallet: addr, wallets: [{ addr, role: "personal" }], links: [], identity_anchor: null, timezone: null,
  hourly: Array(48).fill(0), signals: [], spend: { payments: 0, usdc: 0 }, linkability: { traced: 0, total: 0 }, anonymity_set: null, source: "base-mainnet",
});

test("audit page: an agent wallet on a server signs the challenge there and pastes only the signature", async ({ page }) => {
  const agent = privateKeyToAccount(`0x${"42".repeat(32)}`);
  let sent: { address?: string; signature?: string; nonce?: string } = {};
  await page.route("**/api/audit", async (route) => {
    sent = JSON.parse(route.request().postData() ?? "{}");
    await route.fulfill({ json: emptyProfile(agent.address.toLowerCase()) });
  });
  await page.goto("/audit");
  await page.getByText("Agent wallet on a server? Sign without a browser wallet").click();
  await page.getByLabel("Agent wallet address").fill(agent.address);
  await page.getByRole("button", { name: "Get challenge" }).click();
  const message = await page.getByTestId("challenge-text").innerText();
  expect(message).toContain(agent.address.toLowerCase());
  await expect(page.getByText(/cast wallet sign --private-key "\$AGENT_PRIVATE_KEY"/)).toBeVisible();
  await expect(page.getByText("Never paste a private key here.")).toBeVisible();
  const signature = await agent.signMessage({ message }); // what `cast wallet sign` prints, done where the key lives
  await page.getByLabel("3. Paste the signature it prints").fill(signature);
  await page.getByRole("button", { name: "Audit this wallet" }).click();
  await expect(page.getByText("No agent payments found.")).toBeVisible();
  expect(sent.signature).toBe(signature);
  expect(sent.address?.toLowerCase()).toBe(agent.address.toLowerCase());
});

test("audit page: installed wallets announced by EIP-6963 each get their own button", async ({ page }) => {
  const owner = privateKeyToAccount(`0x${"42".repeat(32)}`);
  await page.exposeFunction("__sign3", async (hexMessage: string) => owner.signMessage({ message: { raw: hexMessage as `0x${string}` } }));
  await page.addInitScript((address: string) => {
    const provider = {
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [address];
        if (method === "personal_sign") return (window as unknown as { __sign3: (m: string) => Promise<string> }).__sign3(params![0] as string);
        throw new Error(`unsupported ${method}`);
      },
      on: () => undefined, removeListener: () => undefined,
    };
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
      detail: Object.freeze({ info: { uuid: "test-uuid", name: "Test Wallet", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>", rdns: "dev.test.wallet" }, provider }),
    }));
    window.addEventListener("eip6963:requestProvider", announce);
  }, owner.address);
  await page.route("**/api/audit", (route) => route.fulfill({ json: emptyProfile(owner.address.toLowerCase()) }));
  await page.goto("/audit");
  const button = page.getByRole("button", { name: "Audit with Test Wallet" });
  await expect(button).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect wallet and audit" })).toHaveCount(0);
  await button.click();
  await expect(page.getByText("No agent payments found.")).toBeVisible();
});
