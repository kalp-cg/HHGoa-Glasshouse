import { expect, test } from "@playwright/test";

for (const path of ["/", "/?fixtures=1"]) {
  test(`demo flips from 238 to 0 traced (${path})`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto(path);
    const traced = page.getByTestId("traced");
    await expect(traced).toContainText("238");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("all 238");
    await expect(page.getByText("UTC+05:30").first()).toBeVisible();
    await expect(page.getByTestId("graph")).toHaveAttribute("data-ready", "open");
    await page.screenshot({ path: `test-results/${info.project.name}${path === "/" ? "" : "-fixtures"}-open.png`, fullPage: true });

    await page.getByRole("radio", { name: "Shield mode" }).click();
    await expect(traced).toContainText("0");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("none of them");
    await expect(page.getByTestId("graph")).toHaveAttribute("data-ready", "shield");
    await expect(page.locator("p", { hasText: /any of\s*\d+\s*people/ }).first()).toBeVisible();
    await page.screenshot({ path: `test-results/${info.project.name}${path === "/" ? "" : "-fixtures"}-shield.png`, fullPage: true });

    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(wide, "no horizontal scroll").toBe(false);
    expect(errors).toEqual([]);
  });
}
