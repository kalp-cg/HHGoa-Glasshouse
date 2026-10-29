// /tour: the whole story for reviewers, one screen at a time (← → or click). Live data where it can be live.
import type { Metadata } from "next";
import { headers } from "next/headers";
import QRCode from "qrcode";
import testnet from "../../../../packages/chain/exports/testnet.shield.json";
import snapshot from "../../../../fixtures/real-base-totals.json";
import { Tour, type Proof } from "./Tour";

export const metadata: Metadata = {
  title: "Glasshouse · the tour",
  description: "What an AI agent's payments reveal, live on Base, and the one switch that hides it.",
};
export const dynamic = "force-dynamic";

// The real Base Sepolia Shield session from packages/chain/exports/testnet.shield.json (pnpm shield:export).
function proof(): Proof | null {
  const rail = testnet.wallets.find((w) => w.kind === "pool")?.addr;
  const release = testnet.transfers.find((t) => t.from === rail);
  const payment = release && testnet.transfers.find((t) => t.from === release.to);
  if (!release || !payment) return null;
  return { funded_tx: release.tx, funded_usdc: release.amount, payment_tx: payment.tx, payment_usdc: payment.amount, at: payment.ts };
}

export default async function TourPage() {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "glasshouse-eta.vercel.app"}`;
  const auditUrl = `${origin}/audit`;
  const qr = await QRCode.toString(auditUrl, { type: "svg", margin: 1, color: { dark: "#0b1220", light: "#ffffff" } });
  return (
    <Tour
      qrSvg={qr}
      auditUrl={auditUrl}
      proof={proof()}
      snapshot={{
        wallets: snapshot.wallets_analysed,
        time_zone: snapshot.give_away_time_zone_pct,
        linked: snapshot.linked_to_another_wallet_pct,
        signal: snapshot.show_a_life_signal_pct,
      }}
    />
  );
}
