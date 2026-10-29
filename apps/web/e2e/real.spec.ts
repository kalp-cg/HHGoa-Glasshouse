import { expect, test } from "@playwright/test";

test("real data page: totals from real Base wallets, and never an address", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/real");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("What real AI agents on Base give away");
  await expect(page.getByText(/give away their time zone/)).toBeVisible();
  await expect(page.getByText(/no wallet is named, stored or shown/)).toBeVisible();
  const text = await page.locator("body").innerText();
  expect(text, "no wallet or transaction hash on the page").not.toMatch(/0x[0-9a-fA-F]{40}/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), "no sideways scroll").toBe(false);
  await page.screenshot({ path: `test-results/${info.project.name}-real.png`, fullPage: true });
  expect(errors).toEqual([]);
});
