// /sandbox/cake: a simulated Cake Wallet top-up into Shield. The phone is a mock; the verdicts are real engine
// output on the seed-42 world, topped up from Exchange A vs. a private swap in Cake Wallet (pnpm fixtures).
import type { Metadata } from "next";
import type { ProfileFacts } from "@glasshouse/engine";
import viaExchange from "../../../../../fixtures/profile.shield.json";
import viaCake from "../../../../../fixtures/profile.shield.cake.json";
import { CakeSandbox } from "./CakeSandbox";

export const metadata: Metadata = {
  title: "Cake Wallet sandbox · Glasshouse",
  description: "Simulated: top up Shield from an exchange or from Cake Wallet, and see what a stranger can still tell.",
};

export default function CakeSandboxPage() {
  const cake = viaCake as ProfileFacts;
  const swap = cake.links.find((l) => l.rule === "funding");
  return (
    <CakeSandbox
      exchange={viaExchange as ProfileFacts}
      cake={cake}
      wallet={cake.seed_wallet}
      swapWallet={swap ? (swap.a === cake.seed_wallet ? swap.b : swap.a) : null}
      usdc={Number(swap?.detail.match(/[\d.]+/)?.[0] ?? 0)}
    />
  );
}
