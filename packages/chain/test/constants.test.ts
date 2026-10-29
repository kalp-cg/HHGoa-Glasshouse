import { describe, expect, it } from "vitest";
import { isAddress } from "viem";
import { BASE_USDC } from "../src/ingestBase";

describe("chain constants", () => {
  it("Base USDC is a valid, checksummed 20-byte address (a dropped character once made it 39 hex digits)", () => {
    expect(BASE_USDC).toHaveLength(42);
    expect(isAddress(BASE_USDC, { strict: true })).toBe(true);
  });
});
