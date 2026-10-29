// The card shown when someone shares a Glasshouse link (Next.js OG image: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image)
import { ImageResponse } from "next/og";

export const alt = "Glasshouse: anyone can trace all 238 of your AI agent's payments to you. One switch: 0.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#f4f6f8", color: "#0b1220", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 44, fontWeight: 700 }}>Glass<span style={{ color: "#2557d6" }}>house</span></div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>Your AI agent pays in public.</div>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, color: "#d92d20", lineHeight: 1.1 }}>Anyone can read it.</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 40 }}>
          <div style={{ display: "flex", fontSize: 120, fontWeight: 900, color: "#d92d20" }}>238</div>
          <div style={{ display: "flex", fontSize: 56, color: "#3a4556", paddingBottom: 22 }}>→</div>
          <div style={{ display: "flex", fontSize: 120, fontWeight: 900, color: "#0e7c66" }}>0</div>
          <div style={{ display: "flex", fontSize: 36, color: "#3a4556", paddingBottom: 26 }}>payments traced, with one switch</div>
        </div>
      </div>
    ),
    size,
  );
}
