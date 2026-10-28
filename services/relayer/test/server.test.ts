import { afterEach, describe, expect, it, vi } from "vitest";
import { createRelayerServer } from "../src/server";

const railAddress = "0x0000000000000000000000000000000000000010" as const;
const to = "0x0000000000000000000000000000000000000020" as const;

describe("POST /release", () => {
  let server: ReturnType<typeof createRelayerServer> | undefined;

  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  it("releases to the requested address and returns the transaction hash", async () => {
    const tx = `0x${"ab".repeat(32)}` as const;
    const writeContract = vi.fn().mockResolvedValue(tx);
    server = createRelayerServer({
      client: { writeContract }, railAddress, delayMs: 0,
    });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP server address");

    const response = await fetch(`http://127.0.0.1:${address.port}/release`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ tx });
    expect(writeContract).toHaveBeenCalledWith({
      address: railAddress,
      abi: expect.any(Array),
      functionName: "release",
      args: [to],
    });
  });

  it("rejects invalid recipients without calling the wallet client", async () => {
    const writeContract = vi.fn();
    server = createRelayerServer({ client: { writeContract }, railAddress, delayMs: 0 });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP server address");
    const response = await fetch(`http://127.0.0.1:${address.port}/release`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: "0x0" }),
    });
    expect(response.status).toBe(400);
    expect(writeContract).not.toHaveBeenCalled();
  });
});
