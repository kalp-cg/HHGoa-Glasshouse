import type { Metadata } from "next";
import { Audit } from "./Audit";

export const metadata: Metadata = {
  title: "Audit your agent · Glasshouse",
  description: "Prove you own your agent's wallet and see what its payments reveal about you.",
};

export default function AuditPage() {
  return <Audit />;
}
