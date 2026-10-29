import { expect, test } from "@playwright/test";
import { mockLive } from "./live-mocks";

test("reviewer tour: seven screens, live pulse, real testnet proof, QR to audit", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await mockLive(page);
  await page.goto("/tour");
  const step = page.getByTestId("tour-step");
  const h1 = page.getByRole("heading", { level: 1 });
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  // on the projector every screen must fit without scrolling
  const fits = async () => {
    if (info.project.name !== "projector") return;
    await page.waitForTimeout(300);
    const tall = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(tall, `screen ${await step.textContent()} fits 1280×720`).toBeLessThanOrEqual(1);
  };

  await expect(step).toHaveText("1 / 7");
  await expect(h1).toContainText("Your AI agent pays in public");
  await fits();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("live-pulse")).toContainText("~264");
  await fits();
  await page.keyboard.press("ArrowRight");
  await expect(h1).toContainText("all 238");
  await expect(page.getByText("UTC+05:30").first()).toBeVisible();
  await fits();
  await page.keyboard.press("ArrowRight");
  await expect(h1).toContainText("0 of 238");
  await fits();
  await page.keyboard.press("ArrowRight");
  const links = page.getByTestId("tour-tx");
  await expect(links).toHaveCount(2);
  await expect(links.first()).toHaveAttribute("href", /^https:\/\/sepolia\.basescan\.org\/tx\/0x[0-9a-f]{64}$/);
  await fits();
  await page.getByRole("button", { name: "Next →" }).click();
  await expect(page.getByTestId("live-real")).toContainText("4");
  await fits();
  await page.keyboard.press("ArrowRight");
  await expect(step).toHaveText("7 / 7");
  await expect(page.locator("svg").filter({ has: page.locator("path") }).first()).toBeVisible();
  await expect(page.getByText(/\/audit$/)).toBeVisible();
  await fits();
  await expect(page.getByRole("button", { name: "Next →" })).toBeDisabled();
  expect(await wide(), "no sideways scroll").toBe(false);
  await page.keyboard.press("ArrowLeft");
  await expect(step).toHaveText("6 / 7");
  expect(errors).toEqual([]);
});
