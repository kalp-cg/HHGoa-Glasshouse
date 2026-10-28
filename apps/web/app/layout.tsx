import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Glasshouse",
  description: "See what your AI agent's payments reveal about you, then make them private with one switch.",
  openGraph: {
    title: "Glasshouse: what your AI agent's payments reveal",
    description: "238 of 238 agent payments traced to one person. Flip to Shield mode: 0 of 238.",
  },
};

export const viewport: Viewport = { colorScheme: "light dark", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
