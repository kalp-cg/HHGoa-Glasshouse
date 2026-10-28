import type { Address, Mode } from "@glasshouse/engine";

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
  console.error(err);
  return Response.json({ error: "internal error" }, { status: 500 });
}

// ?wallet=0x..&mode=open|shield
export function walletAndMode(req: Request): { wallet: Address; mode: Mode } {
  const params = new URL(req.url).searchParams;
  const wallet = params.get("wallet")?.toLowerCase() ?? "";
  const mode = params.get("mode");
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) throw new HttpError(400, "wallet must be a 0x address");
  if (mode !== "open" && mode !== "shield") throw new HttpError(400, "mode must be open or shield");
  return { wallet: wallet as Address, mode };
}
