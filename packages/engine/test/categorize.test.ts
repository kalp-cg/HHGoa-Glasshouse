import { describe, expect, it } from "vitest";
import { categorize } from "../src/categorize";

describe("categorize (x402 service descriptions)", () => {
  it.each([
    ["Check symptoms and get a likely diagnosis", "Health"],
    ["Rank your resume against a job posting", "Career"],
    ["Search cheap flights and hotels for a trip", "Travel"],
    ["Estimate your income tax and loan options", "Finance"],
    ["AI contract review for freelancers", "Legal"],
    ["Send a Base token contract address, get an AI-written verdict", "Trading"],
    ["Real-time token price and liquidity", "Trading"],
    ["Generate a random UUID v4", "Developer"],
  ])("%s → %s", (text, cat) => expect(categorize(text)).toBe(cat));

  it("plumbing is never a health signal", () => {
    expect(categorize("Health check ping")).toBe("Developer");
  });

  it("unclear descriptions stay unlabelled", () => {
    expect(categorize("Payment quote with amount, asset, and merchant wallet")).toBeNull();
    expect(categorize("Current server time in UTC")).toBe("Developer");
    expect(categorize("Hello world")).toBeNull();
  });
});
