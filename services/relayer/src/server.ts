import { createServer, type IncomingMessage, type Server } from "node:http";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// viem wallet-client writeContract API: https://viem.sh/docs/clients/wallet and https://viem.sh/docs/contract/writeContract
const RAIL_ABI = [{
  type: "function",
  name: "release",
  stateMutability: "nonpayable",
  inputs: [{ name: "to", type: "address" }],
  outputs: [],
}] as const;

type ReleaseClient = {
  writeContract(args: {
    address: `0x${string}`;
    abi: typeof RAIL_ABI;
    functionName: "release";
    args: readonly [`0x${string}`];
  }): Promise<Hex>;
};

type RelayerOptions = {
  client: ReleaseClient;
  railAddress: `0x${string}`;
  delayMs: number;
  random?: () => number;
};

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createRelayerServer({ client, railAddress, delayMs, random = Math.random }: RelayerOptions): Server {
  return createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/release") {
      response.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "Not found" }));
      return;
    }
    let body: unknown;
    try {
      body = await readJson(request);
    } catch {
      response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }
    const to = typeof body === "object" && body !== null && "to" in body ? body.to : undefined;
    if (typeof to !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(to) || /^0x0{40}$/i.test(to)) {
      response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "Invalid recipient" }));
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, Math.floor(random() * (delayMs + 1))));
    try {
      const tx = await client.writeContract({ address: railAddress, abi: RAIL_ABI, functionName: "release", args: [to as `0x${string}`] });
      console.log(tx);
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ tx }));
    } catch {
      response.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: "Release failed" }));
    }
  });
}

export function startRelayer(): Server {
  const privateKey = process.env.RELAYER_PRIVATE_KEY;
  const railAddress = process.env.RAIL_ADDRESS;
  if (!privateKey || !railAddress || !/^0x[0-9a-fA-F]{40}$/.test(railAddress)) {
    throw new Error("RELAYER_PRIVATE_KEY and valid RAIL_ADDRESS are required");
  }
  const account = privateKeyToAccount(privateKey as Hex);
  const client = createWalletClient({ account, chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC_URL) });
  const server = createRelayerServer({ client, railAddress: railAddress as `0x${string}`, delayMs: Number(process.env.RELAYER_DELAY_MS ?? 3000) });
  server.listen(Number(process.env.RELAYER_PORT ?? 8787));
  return server;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) startRelayer();
