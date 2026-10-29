"use client";
// Installed browser wallets, discovered by EIP-6963 (https://eips.ethereum.org/EIPS/eip-6963): each wallet extension
// (MetaMask, Rabby, Coinbase Wallet, ...) announces itself, so the user picks one instead of whichever grabbed
// window.ethereum first. Falls back to window.ethereum for wallets that only inject the old way.
import { useEffect, useState } from "react";
import type { EIP1193Provider } from "viem";

export interface InjectedWallet { id: string; name: string; icon: string | null; provider: EIP1193Provider }

interface AnnounceDetail { info: { uuid: string; name: string; icon: string; rdns: string }; provider: EIP1193Provider }

export function useInjectedWallets(): InjectedWallet[] {
  const [wallets, setWallets] = useState<InjectedWallet[]>([]);
  useEffect(() => {
    const onAnnounce = (e: Event) => {
      const { info, provider } = (e as CustomEvent<AnnounceDetail>).detail;
      setWallets((ws) => (ws.some((w) => w.id === info.rdns) ? ws : [...ws, { id: info.rdns, name: info.name, icon: info.icon, provider }]));
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
  }, []);
  return wallets;
}
