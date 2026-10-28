import { afterEach, describe, expect, it, vi } from "vitest";
import { payX402 } from "../src/x402";

const paymentRequired = Buffer.from(JSON.stringify({
  x402Version: 2,
  resource: { url: "https://example.test/data", description: "Test data", mimeType: "application/json" },
  accepts: [{
    scheme: "exact",
    network: "eip155:84532",
    amount: "1000",
    asset: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
    payTo: "0x0000000000000000000000000000000000000002",
    maxTimeoutSeconds: 60,
    extra: { name: "USDC", version: "2" },
  }],
})).toString("base64");

afterEach(() => vi.unstubAllGlobals());

describe("payX402", () => {
  it("handles a mocked 402 challenge and returns the settlement transaction", async () => {
    const tx = `0x${"ab".repeat(32)}`;
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 402, headers: { "PAYMENT-REQUIRED": paymentRequired } }))
      .mockResolvedValueOnce(new Response("paid", {
        status: 200,
        headers: { "PAYMENT-RESPONSE": Buffer.from(JSON.stringify({ success: true, transaction: tx, network: "eip155:84532" })).toString("base64") },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(payX402("https://example.test/data", { privateKey: `0x${"11".repeat(32)}` }))
      .resolves.toEqual({ tx, status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // the SDK retries with a Request object (or url + init); read the header either way
    const [input, init] = fetchMock.mock.calls[1]!;
    const headers = input instanceof Request ? input.headers : new Headers(init?.headers);
    expect(headers.get("PAYMENT-SIGNATURE")).toBeTruthy();
  });
});
