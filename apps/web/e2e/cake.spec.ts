import { expect, test } from "@playwright/test";

test("Cake Wallet sandbox: clearly simulated; exchange route still names you, Cake route doesn't", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/sandbox/cake");
  await expect(page.getByRole("note")).toContainText("Sandbox, simulated");

  await page.getByRole("button", { name: /Top up agents/ }).click();
  await page.getByRole("button", { name: /Withdraw from Exchange A/ }).click();
  await expect(page.getByTestId("verdict")).toContainText("Still named: funded from Exchange A", { timeout: 10_000 });
  await expect(page.getByTestId("verdict")).toContainText("0 / 238");

  await page.getByRole("button", { name: /Try the Cake Wallet route/ }).click();
  await expect(page.getByTestId("verdict")).toContainText("Nothing names you", { timeout: 10_000 });
  await expect(page.getByTestId("phone")).toContainText("simulated tx");

  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), "no sideways scroll").toBe(false);
  await page.screenshot({ path: `test-results/${info.project.name}-cake.png`, fullPage: true });
  expect(errors).toEqual([]);
});
