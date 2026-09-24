"use client";
// A preview of the disc: the real groove radii, the real spiral density and a label with the
// parameters. It is drawn from the same numbers that go into the G-code, so it shows the actual
// layout rather than an icon.

// The type comes from the engine, so the preview and the G-code cannot drift apart.
export type { DecorStyle } from "@/src/gcode/decor";
import type { DecorStyle } from "@/src/gcode/decor";
import { textPolys, textRadiusMm } from "@/src/gcode/font";

/** The same patterns as the G-code (src/gcode/decor.ts), in SVG, to preview before printing. */
function decorElements(style: DecorStyle, c: number, k: number, rMin: number, rMax: number, stroke: string) {
  if (style === "none" || rMax - rMin < 6) return null;
  const sw = Math.max(0.5, 0.42 * k);
  if (style === "rings") {
    const out = [];
    let r = rMax, gap = 1.2;
    while (r > rMin) { out.push(r); r -= gap; gap *= 1.18; }
    return out.map((rr, i) => <circle key={i} cx={c} cy={c} r={rr * k} fill="none" stroke={stroke} strokeWidth={sw} strokeOpacity="0.85" />);
  }
  if (style === "sunburst") {
    const mid = (rMin + rMax) / 2;
    const spokes = 48;
    return (
      <>
        {Array.from({ length: spokes }, (_, i) => {
          const th = (2 * Math.PI * i) / spokes;
          const r1 = i % 4 === 0 ? rMax - 0.5 : i % 2 === 0 ? mid + 3 : mid - 3;
          return <line key={i} x1={c + (rMin + 1) * k * Math.cos(th)} y1={c + (rMin + 1) * k * Math.sin(th)} x2={c + r1 * k * Math.cos(th)} y2={c + r1 * k * Math.sin(th)} stroke={stroke} strokeWidth={sw} strokeOpacity="0.85" />;
        })}
        <circle cx={c} cy={c} r={(rMax - 0.5) * k} fill="none" stroke={stroke} strokeWidth={sw} strokeOpacity="0.85" />
      </>
    );
  }
  if (style === "spiral") {
    const pitch = 1.3, turns = (rMax - rMin) / pitch, steps = Math.round(turns * 90);
    let d = "";
    for (let i = 0; i <= steps; i += 1) {
      const th = (2 * Math.PI * turns * i) / steps, rr = rMin + (pitch * th) / (2 * Math.PI);
      d += `${i === 0 ? "M" : "L"}${(c + rr * k * Math.cos(th)).toFixed(1)} ${(c + rr * k * Math.sin(th)).toFixed(1)}`;
    }
    return <path d={d} fill="none" stroke={stroke} strokeWidth={sw} strokeOpacity="0.85" />;
  }
  if (style === "star") {
    return (
      <>
        {([[12, 5, 1], [8, 3, 0.62]] as [number, number, number][]).map(([n, kk, scale], si) => {
          const R = (rMax - 0.8) * scale;
          if (R * Math.cos((Math.PI * kk) / n) < rMin) return null;
          let d = "";
          for (let i = 0; i <= n; i += 1) {
            const th = (2 * Math.PI * ((i * kk) % n)) / n;
            d += `${i === 0 ? "M" : "L"}${(c + R * k * Math.cos(th)).toFixed(1)} ${(c + R * k * Math.sin(th)).toFixed(1)}`;
          }
          return <path key={si} d={d} fill="none" stroke={stroke} strokeWidth={sw} strokeOpacity="0.85" />;
        })}
        <circle cx={c} cy={c} r={(rMax - 0.5) * k} fill="none" stroke={stroke} strokeWidth={sw} strokeOpacity="0.85" />
      </>
    );
  }
  if (style === "waves") {
    const gap = 2.2, amp = 0.7, lobes = 18;
    const out = [];
    for (let i = 0, r = rMax - 1; r > rMin + amp; i += 1, r -= gap) {
      const phase = (i * Math.PI) / 3, rr = r;
      let d = "";
      for (let j = 0; j <= 240; j += 1) {
        const th = (2 * Math.PI * j) / 240, rad = rr + amp * Math.sin(lobes * th + phase);
        d += `${j === 0 ? "M" : "L"}${(c + rad * k * Math.cos(th)).toFixed(1)} ${(c + rad * k * Math.sin(th)).toFixed(1)}`;
      }
      out.push(<path key={i} d={d} fill="none" stroke={stroke} strokeWidth={sw} strokeOpacity="0.85" />);
    }
    return <>{out}</>;
  }
  if (style === "guilloche") {
    const petals = 9, dRatio = 0.3;
    const R = (rMax - 1) / (1 - 1 / petals + dRatio), rr = R / petals, d0 = R * dRatio;
    return (
      <>
        {[0, 1, 2, 3].map((copy) => {
          const rot = (copy * 2 * Math.PI) / (petals * 4);
          const cosR = Math.cos(rot), sinR = Math.sin(rot);
          const steps = petals * 80;
          let d = "";
          for (let i = 0; i <= steps; i += 1) {
            const t = (2 * Math.PI * petals * i) / steps;
            const bx = (R - rr) * Math.cos(t) + d0 * Math.cos(((R - rr) / rr) * t);
            const by = (R - rr) * Math.sin(t) - d0 * Math.sin(((R - rr) / rr) * t);
            const x = bx * cosR - by * sinR, y = bx * sinR + by * cosR;
            d += `${i === 0 ? "M" : "L"}${(c + x * k).toFixed(1)} ${(c + y * k).toFixed(1)}`;
          }
          return <path key={copy} d={d} fill="none" stroke={stroke} strokeWidth={sw} strokeOpacity="0.7" />;
        })}
      </>
    );
  }
  const paths = [1, 0.72, 0.46].map((scale, si) => {
    const petals = [11, 7, 5][si], dRatio = 0.42;
    const R = ((rMax - 1) * scale) / (1 - 1 / petals + dRatio);
    const d = R * dRatio, rr = R / petals;
    const steps = petals * 90;
    let dstr = "";
    for (let i = 0; i <= steps; i += 1) {
      const t = (2 * Math.PI * petals * i) / steps;
      const x = (R - rr) * Math.cos(t) + d * Math.cos(((R - rr) / rr) * t);
      const y = (R - rr) * Math.sin(t) - d * Math.sin(((R - rr) / rr) * t);
      dstr += `${i === 0 ? "M" : "L"}${(c + x * k).toFixed(1)} ${(c + y * k).toFixed(1)}`;
    }
    return <path key={si} d={dstr} fill="none" stroke={stroke} strokeWidth={sw} strokeOpacity="0.85" />;
  });
  return <>{paths}<circle cx={c} cy={c} r={(rMax - 0.5) * k} fill="none" stroke={stroke} strokeWidth={sw} strokeOpacity="0.85" /></>;
}

/** The centre pattern alone, scaled to fill the frame, for the picker thumbnails. */
export function DecorSwatch({ style, twoColor, size = 76 }: { style: DecorStyle; twoColor: boolean; size?: number }) {
  const c = size / 2, rMax = 55, rMin = 6.25;
  const k = (size / 2 - 3) / rMax;
  const accent = twoColor ? "var(--amber-2)" : "#efe7d8";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={c} cy={c} r={size / 2 - 1} fill="var(--wax)" />
      {decorElements(style, c, k, rMin, rMax, accent)}
      <circle cx={c} cy={c} r={Math.max(1.5, 3.75 * k)} fill="var(--paper)" />
    </svg>
  );
}

export function VinylDisc({ diameterMm, outerR, innerR, pitchMm, spinning, size = 240, decorStyle = "none", twoColor = false, holeMm = 7.5, textLines = [], textHeightMm = 7 }: {
  diameterMm: number; outerR: number; innerR: number; pitchMm: number;
  spinning?: boolean; size?: number;
  decorStyle?: DecorStyle; twoColor?: boolean; holeMm?: number;
  textLines?: string[]; textHeightMm?: number;
}) {
  const R = diameterMm / 2;
  const k = (size / 2 - 4) / R;              // mm -> px
  const c = size / 2;
  const turns = Math.max(1, Math.floor((outerR - innerR) / pitchMm));
  const shown = Math.min(turns, 26);          // draw every nth groove, or they merge into a blur
  const every = Math.max(1, Math.round(turns / shown));
  const rings: number[] = [];
  for (let i = 0; i <= turns; i += every) rings.push(outerR - i * pitchMm);
  const clean = textLines.map((l) => l.trim()).filter(Boolean);
  const zone = { rMin: holeMm / 2 + 2.5, rMax: innerR - 2 };
  if (clean.length) zone.rMin = Math.max(zone.rMin, textRadiusMm(clean, textHeightMm, textHeightMm * 0.55));
  const accent = twoColor ? "var(--amber-2)" : "#efe7d8";
  const grooveStroke = twoColor ? "var(--amber-2)" : "#fff";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Disc preview">
      <defs>
        <radialGradient id="wax" cx="38%" cy="30%">
          <stop offset="0%" stopColor="#3a332c" />
          <stop offset="55%" stopColor="var(--wax)" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>
        <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="42%" stopColor="#fff" stopOpacity="0.02" />
          <stop offset="70%" stopColor="#fff" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className={spinning ? "spinning" : undefined}>
        <circle cx={c} cy={c} r={R * k} fill="url(#wax)" />
        {rings.map((r, i) => (
          <circle key={i} cx={c} cy={c} r={r * k} fill="none" stroke={grooveStroke} strokeOpacity={twoColor ? 0.5 : 0.13} strokeWidth={Math.max(0.5, pitchMm * k * 0.3)} />
        ))}
        <circle cx={c} cy={c} r={outerR * k} fill="none" stroke={grooveStroke} strokeOpacity={0.3} strokeWidth="1" />
        {decorElements(decorStyle, c, k, zone.rMin, zone.rMax, accent)}
        {/* The label uses the same single stroke font as the G-code, so the preview cannot lie. */}
        {clean.map((line, i) => {
          const gap = textHeightMm * 0.55;
          const blockH = clean.length * textHeightMm + (clean.length - 1) * gap;
          const baseline = blockH / 2 - textHeightMm - i * (textHeightMm + gap);
          return textPolys(line, { capHeightMm: textHeightMm, centerX: 0, baselineY: baseline }).map((poly, j) => (
            <polyline
              key={`${i}-${j}`}
              points={poly.map((pt) => `${(c + pt.x * k).toFixed(1)},${(c - pt.y * k).toFixed(1)}`).join(" ")}
              fill="none" stroke={accent} strokeWidth={Math.max(0.8, 0.42 * k)} strokeLinecap="round" strokeLinejoin="round"
            />
          ));
        })}
        <circle cx={c} cy={c} r={Math.max(2.5, 3.75 * k)} fill="var(--paper)" stroke="#00000055" />
      </g>
      <circle cx={c} cy={c} r={R * k} fill="url(#sheen)" pointerEvents="none" />
    </svg>
  );
}
