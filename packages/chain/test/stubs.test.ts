import { describe, expect, it } from "vitest";
import { fetchAgentTransfers, newOneTimeWallet, payX402, verifyOwnership } from "../src/index";

const addr = "0x0000000000000000000000000000000000000001" as const;

describe("chain stubs (replaced by Codex)", () => {
  it("throw not implemented", async () => {
    expect(() => newOneTimeWallet()).toThrow("not implemented");
    await expect(verifyOwnership(addr, "m", "0x00")).rejects.toThrow("not implemented");
    await expect(fetchAgentTransfers(addr, { fromBlock: 0n, toBlock: 1n })).rejects.toThrow("not implemented");
    await expect(payX402("https://example.com", { privateKey: "0x00" })).rejects.toThrow("not implemented");
  });
});
