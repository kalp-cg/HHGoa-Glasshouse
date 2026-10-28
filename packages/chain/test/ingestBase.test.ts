import fixture from "./fixtures/base-logs.json";
import { describe, expect, it } from "vitest";
import type { Address } from "@glasshouse/engine";
import { fetchAgentTransfers, ledgerFromLogs } from "../src/ingestBase";

const typedLogs = (logs: Record<string, unknown>[]) => logs.map((log) => ({
  ...log,
  blockNumber: "blockNumber" in log ? BigInt(String(log.blockNumber)) : null,
  args: typeof log.args === "object" && log.args !== null
    ? Object.fromEntries(Object.entries(log.args).map(([key, value]) => [key, key === "value" ? BigInt(String(value)) : value]))
    : undefined,
})) as never;

describe("ledgerFromLogs", () => {
  it("maps recorded Base logs into a lowercase Ledger and joins authorization by tx hash", () => {
    const address = fixture.address as Address;
    const timestamps = new Map(Object.entries(fixture.timestamps).map(([block, ts]) => [BigInt(block), ts]));
    const ledger = ledgerFromLogs(
      address,
      BigInt(fixture.fromBlock),
      BigInt(fixture.toBlock),
      typedLogs(fixture.outgoing),
      typedLogs(fixture.incoming),
      typedLogs(fixture.authorizations),
      timestamps,
    );

    expect(ledger.seed).toBe(0);
    expect(ledger.start_ts).toBe(1_700_000_000);
    expect(ledger.days).toBe(2);
    expect(ledger.transfers).toEqual([
      {
        tx: fixture.outgoing[0]!.transactionHash,
        from: address,
        to: "0x0000000000000000000000000000000000000002",
        amount: 1.25,
        ts: 1_700_000_100,
      },
      {
        tx: fixture.incoming[0]!.transactionHash,
        from: "0x0000000000000000000000000000000000000004",
        to: address,
        amount: 5,
        ts: 1_700_000_300,
      },
    ]);
    expect(ledger.wallets.map((wallet) => wallet.addr)).toEqual([
      address,
      "0x0000000000000000000000000000000000000002",
      "0x0000000000000000000000000000000000000004",
    ]);
    expect(ledger.wallets.every((wallet) => wallet.kind === "" && wallet.label === "")).toBe(true);
  });
});

describe("fetchAgentTransfers", () => {
  it("rejects invalid ranges before making an RPC request", async () => {
    await expect(fetchAgentTransfers(fixture.address as Address, { fromBlock: 10n, toBlock: 9n }))
      .rejects.toThrow("Invalid Base block range");
  });
});
