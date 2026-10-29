import { describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { newOneTimeWallet, verifyOwnership } from "../src/index";
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
const noChain = { verifyMessage: async () => false };

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

    await expect(verifyOwnership(other.address as Address, "Glasshouse ownership challenge", signature, { chain: noChain })).resolves.toBe(false);
  });

  it("rejects a tampered message", async () => {
    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const signature = await account.signMessage({ message: "Original challenge" });

    await expect(verifyOwnership(account.address as Address, "Tampered challenge", signature, { chain: noChain })).resolves.toBe(false);
  });
});

describe("verifyOwnership: smart wallets", () => {
  const wallet = "0x00000000000000000000000000000000000c0de0" as Address;
  const longSig = `0x${"ab".repeat(400)}` as `0x${string}`; // smart-wallet signatures are not 65 bytes

  it("asks the chain (ERC-1271 / ERC-6492) when the local check fails, and accepts what the chain accepts", async () => {
    const chain = { verifyMessage: vi.fn(async () => true) };
    await expect(verifyOwnership(wallet, "challenge", longSig, { chain })).resolves.toBe(true);
    expect(chain.verifyMessage).toHaveBeenCalledWith({ address: wallet, message: "challenge", signature: longSig });
  });

  it("an ordinary wallet's valid signature never needs the chain", async () => {
    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const chain = { verifyMessage: vi.fn(async () => false) };
    const signature = await account.signMessage({ message: "m" });
    await expect(verifyOwnership(account.address as Address, "m", signature, { chain })).resolves.toBe(true);
    expect(chain.verifyMessage).not.toHaveBeenCalled();
  });

  it("a chain error is a no, never a yes", async () => {
    const chain = { verifyMessage: async () => { throw new Error("rpc down"); } };
    await expect(verifyOwnership(wallet, "challenge", longSig, { chain })).resolves.toBe(false);
  });
});
