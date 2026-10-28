import { describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { fetchAgentTransfers, newOneTimeWallet, payX402, verifyOwnership } from "../src/index";
import type { Address } from "@glasshouse/engine";

describe("newOneTimeWallet", () => {
  it("returns unique wallets without logging their keys", () => {
    const logSpies = ["log", "info", "warn", "error", "debug"].map((name) =>
      vi.spyOn(console, name as "log").mockImplementation(() => undefined),
    );
    const wallets = Array.from({ length: 5 }, newOneTimeWallet);

    expect(new Set(wallets.map(({ address }) => address)).size).toBe(wallets.length);
    const logs = logSpies.flatMap((spy) => spy.mock.calls.flat()).map(String).join(" ");
    for (const { privateKey } of wallets) expect(logs).not.toContain(privateKey);
    for (const spy of logSpies) spy.mockRestore();
  });
});

describe("verifyOwnership", () => {
  it("accepts a valid EIP-191 signature", async () => {
    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const message = "Glasshouse ownership challenge";
    const signature = await account.signMessage({ message });

    await expect(verifyOwnership(account.address as Address, message, signature)).resolves.toBe(true);
  });

  it("rejects a signature from a different address", async () => {
    const signer = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const other = privateKeyToAccount(`0x${"22".repeat(32)}`);
    const signature = await signer.signMessage({ message: "Glasshouse ownership challenge" });

    await expect(verifyOwnership(other.address as Address, "Glasshouse ownership challenge", signature)).resolves.toBe(false);
  });

  it("rejects a tampered message", async () => {
    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const signature = await account.signMessage({ message: "Original challenge" });

    await expect(verifyOwnership(account.address as Address, "Tampered challenge", signature)).resolves.toBe(false);
  });
});

describe("Phase 3/4 chain stubs", () => {
  const address = "0x0000000000000000000000000000000000000001" as Address;

  it("remain explicitly unimplemented", async () => {
    await expect(fetchAgentTransfers(address, { fromBlock: 0n, toBlock: 1n })).rejects.toThrow("not implemented");
    await expect(payX402("https://example.com", { privateKey: "0x00" })).rejects.toThrow("not implemented");
  });
});
