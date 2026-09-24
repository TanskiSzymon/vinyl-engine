import { ImageResponse } from "next/og";

export const alt = "Vinyl·Engine, print a playable record";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: "#f2ece1", padding: 64, gap: 56 }}>
        <div style={{ width: 420, height: 420, borderRadius: 210, background: "#141210", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 150, height: 150, borderRadius: 75, background: "#d2601a", display: "flex" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", color: "#1b1815" }}>
          <div style={{ fontSize: 92, fontWeight: 800, letterSpacing: -3 }}>VINYL·ENGINE</div>
          <div style={{ width: 260, height: 6, background: "#1b1815", margin: "18px 0 26px" }} />
          <div style={{ fontSize: 34, color: "#57503f", maxWidth: 620, lineHeight: 1.35 }}>
            Turn an audio file into a playable record you can print on an ordinary 3D printer.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
