// Decoration: the middle of the disc (from the hole to the innermost groove) and an optional
// border near the rim. It is drawn in the same layers as the first groove layers, so with a
// colour change it comes out in the groove colour and the flat base keeps the first colour.
//
// The patterns are parametric and closed (the end meets the start) so they leave no strings.
import { polarPath, type PathPoint } from "../record/groove";
import type { RecordParams } from "../record/layout";
import type { GcodeWriter } from "./emit";
import { textPolys, textRadiusMm } from "./font";

const TWO_PI = 2 * Math.PI;

export type DecorStyle = "none" | "rings" | "sunburst" | "rosette" | "spiral" | "star" | "waves" | "guilloche";

export const DECOR_STYLES: DecorStyle[] = ["none", "rings", "sunburst", "rosette", "spiral", "star", "waves", "guilloche"];

/** The free field in the middle: from the hole edge plus a margin to the inner end of the groove. */
export function decorZone(p: RecordParams): { rMin: number; rMax: number } {
  return { rMin: p.holeMm / 2 + 2.5, rMax: p.innerGrooveR - 2 };
}

function circle(p: RecordParams, radius: number, width: number, seed = 0): PathPoint[] {
  const start = (seed * 0.618 % 1) * TWO_PI;
  return polarPath({ cx: p.centerX, cy: p.centerY, thetaStart: start, thetaEnd: start + TWO_PI, spacingMm: 0.6, radius: () => radius, width });
}

/** Concentric rings with a growing gap: the grooves echoed, but sparse and flat. */
function rings(p: RecordParams, z: { rMin: number; rMax: number }, w: number): PathPoint[][] {
  const out: PathPoint[][] = [];
  let r = z.rMax, gap = 1.2, i = 0;
  while (r > z.rMin) {
    out.push(circle(p, r, w, i));
    r -= gap;
    gap *= 1.18;         // ku srodkowi coraz rzadziej
    i += 1;
  }
  return out;
}

/** Radial strokes like a dial, alternating long and short. */
function sunburst(p: RecordParams, z: { rMin: number; rMax: number }, w: number): PathPoint[][] {
  const out: PathPoint[][] = [];
  const spokes = 48;
  const mid = (z.rMin + z.rMax) / 2;
  for (let i = 0; i < spokes; i += 1) {
    const th = (TWO_PI * i) / spokes;
    const r0 = z.rMin + 1;
    const r1 = i % 4 === 0 ? z.rMax - 0.5 : i % 2 === 0 ? mid + 3 : mid - 3;
    const pts: PathPoint[] = [];
    const steps = Math.max(2, Math.round((r1 - r0) / 0.6));
    for (let s = 0; s <= steps; s += 1) {
      const r = r0 + ((r1 - r0) * s) / steps;
      pts.push({ x: p.centerX + r * Math.cos(th), y: p.centerY + r * Math.sin(th), w });
    }
    out.push(pts);
  }
  out.push(circle(p, z.rMax - 0.5, w, 1), circle(p, z.rMin + 0.5, w, 2));
  return out;
}

/**
 * A rosette (hypotrochoid), the spirograph curve, closed after `petals` passes.
 * Drawn at three scales, which gives a star inside a star.
 */
function rosette(p: RecordParams, z: { rMin: number; rMax: number }, w: number): PathPoint[][] {
  const out: PathPoint[][] = [];
  const scales = [1, 0.72, 0.46];
  for (let si = 0; si < scales.length; si += 1) {
    const petals = [11, 7, 5][si];
    const dRatio = 0.42;
    // A hypotrochoid reaches (R - rr) + d. R is chosen so that peak lands on the wanted radius.
    const target = (z.rMax - 1) * scales[si];
    const R = target / (1 - 1 / petals + dRatio);
    const d = R * dRatio;
    const rr = R / petals;
    const pts: PathPoint[] = [];
    const steps = Math.max(600, Math.round(petals * 220));
    for (let i = 0; i <= steps; i += 1) {
      const t = (TWO_PI * petals * i) / steps;
      const x = (R - rr) * Math.cos(t) + d * Math.cos(((R - rr) / rr) * t);
      const y = (R - rr) * Math.sin(t) - d * Math.sin(((R - rr) / rr) * t);
      if (Math.hypot(x, y) < z.rMin) continue;
      pts.push({ x: p.centerX + x, y: p.centerY + y, w });
    }
    if (pts.length > 2) out.push(pts);
  }
  out.push(circle(p, z.rMax - 0.5, w, 3));
  return out;
}

/** A single continuous Archimedean spiral: the groove echoed, sparser and flat. */
function spiral(p: RecordParams, z: { rMin: number; rMax: number }, w: number): PathPoint[][] {
  const pitch = 1.3;
  const turns = (z.rMax - z.rMin) / pitch;
  return [polarPath({
    cx: p.centerX, cy: p.centerY, thetaStart: 0, thetaEnd: TWO_PI * turns, spacingMm: 0.6,
    radius: (th) => z.rMin + (pitch * th) / TWO_PI, width: w,
  })];
}

/**
 * A star polygon {n/k}: join every kth of n vertices until the path returns to its start.
 * Two nested stars plus the circle that encloses them.
 */
function star(p: RecordParams, z: { rMin: number; rMax: number }, w: number): PathPoint[][] {
  const out: PathPoint[][] = [];
  for (const [n, k, scale] of [[12, 5, 1], [8, 3, 0.62]] as [number, number, number][]) {
    const R = (z.rMax - 0.8) * scale;
    if (R * Math.cos((Math.PI * k) / n) < z.rMin) continue;      // the chords must not enter the hole
    const pts: PathPoint[] = [];
    for (let i = 0; i <= n; i += 1) {
      const th = (TWO_PI * ((i * k) % n)) / n;
      const nx = (TWO_PI * (((i + 1) * k) % n)) / n;
      const steps = 14;                                          // subdivide the chord to follow the path
      for (let sIdx = 0; sIdx < steps; sIdx += 1) {
        const t = sIdx / steps;
        const x0 = R * Math.cos(th), y0 = R * Math.sin(th);
        const x1 = R * Math.cos(nx), y1 = R * Math.sin(nx);
        pts.push({ x: p.centerX + x0 + (x1 - x0) * t, y: p.centerY + y0 + (y1 - y0) * t, w });
      }
    }
    out.push(pts);
  }
  out.push(circle(p, z.rMax - 0.5, w, 7));
  return out;
}

/** Concentric waves: circles modulated by a sine, like ripples on water. */
function waves(p: RecordParams, z: { rMin: number; rMax: number }, w: number): PathPoint[][] {
  const out: PathPoint[][] = [];
  const gap = 2.2, amp = 0.7, lobes = 18;
  for (let i = 0, r = z.rMax - 1; r > z.rMin + amp; i += 1, r -= gap) {
    const phase = (i * Math.PI) / 3;                              // each ring is rotated
    const rr = r;
    out.push(polarPath({
      cx: p.centerX, cy: p.centerY, thetaStart: 0, thetaEnd: TWO_PI, spacingMm: 0.5,
      radius: (th) => rr + amp * Math.sin(lobes * th + phase), width: w,
    }));
  }
  return out;
}

/** Guilloche as on a banknote: several copies of the same epitrochoid, rotated against each other. */
function guilloche(p: RecordParams, z: { rMin: number; rMax: number }, w: number): PathPoint[][] {
  const out: PathPoint[][] = [];
  const petals = 9, dRatio = 0.3;
  const R = (z.rMax - 1) / (1 - 1 / petals + dRatio);
  const rr = R / petals, d = R * dRatio;
  for (let copy = 0; copy < 4; copy += 1) {
    const rot = (copy * TWO_PI) / (petals * 4);
    const pts: PathPoint[] = [];
    const steps = petals * 200;
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    for (let i = 0; i <= steps; i += 1) {
      const t = (TWO_PI * petals * i) / steps;
      const bx = (R - rr) * Math.cos(t) + d * Math.cos(((R - rr) / rr) * t);
      const by = (R - rr) * Math.sin(t) - d * Math.sin(((R - rr) / rr) * t);
      // obrot calej figury - inaczej promien maksymalny rosnie i wzor wychodzi poza pole
      const x = bx * cosR - by * sinR, y = bx * sinR + by * cosR;
      if (Math.hypot(x, y) < z.rMin) continue;
      pts.push({ x: p.centerX + x, y: p.centerY + y, w });
    }
    if (pts.length > 2) out.push(pts);
  }
  return out;
}

/** Label text: up to two centred lines, as polylines ready to extrude. */
export function labelTextPaths(p: RecordParams, lines: string[], capHeightMm: number, w: number): PathPoint[][] {
  const clean = lines.map((l) => l.trim()).filter(Boolean);
  if (clean.length === 0) return [];
  const gap = capHeightMm * 0.55;
  const blockH = clean.length * capHeightMm + (clean.length - 1) * gap;
  const topBaseline = p.centerY + blockH / 2 - capHeightMm;
  return clean.flatMap((line, i) =>
    textPolys(line, { capHeightMm, centerX: p.centerX, baselineY: topBaseline - i * (capHeightMm + gap) })
      .map((poly) => poly.map((pt) => ({ x: pt.x, y: pt.y, w }))));
}

/**
 * The decoration in its separate pieces, because the mesh path wants the patterns without the
 * label text: it lays the text out itself, around the spindle hole.
 */
export function decorParts(p: RecordParams, style: DecorStyle, textLines: string[] = [], capHeightMm = 6, watermark = ""): { center: PathPoint[][]; rim: PathPoint[][]; text: PathPoint[][]; mark: PathPoint[][] } {
  const z = decorZone(p);
  const text = labelTextPaths(p, textLines, capHeightMm, p.beadWidthMm);
  // Watermark: small text just above the hole. It does not touch the grooves and takes no room
  // from the patterns, because the field next to the hole is empty anyway.
  const mark = watermark
    ? textPolys(watermark, { capHeightMm: 3, centerX: p.centerX, baselineY: p.centerY - z.rMin - 3.5, tracking: 1.6 })
        .map((poly) => poly.map((pt) => ({ x: pt.x, y: pt.y, w: p.beadWidthMm })))
    : [];
  // The decoration gives the text room: the radius the text needs pushes the pattern outward.
  if (text.length > 0) z.rMin = Math.max(z.rMin, textRadiusMm(textLines.filter(Boolean), capHeightMm, capHeightMm * 0.55));
  if (style === "none" || z.rMax - z.rMin < 6) return { center: [], rim: [], text, mark };
  const w = p.beadWidthMm;
  const center =
    style === "sunburst" ? sunburst(p, z, w)
    : style === "rosette" ? rosette(p, z, w)
    : style === "spiral" ? spiral(p, z, w)
    : style === "star" ? star(p, z, w)
    : style === "waves" ? waves(p, z, w)
    : style === "guilloche" ? guilloche(p, z, w)
    : rings(p, z, w);
  // Rim border: as many rings as fit in the free band beyond the last groove.
  const rim: PathPoint[][] = [];
  const rimFree = p.outerGrooveR + p.beadWidthMm + 2 * p.amplitudeMm + 0.4; // how far the groove reaches
  for (let i = 0, r = p.diameterMm / 2 - w / 2 - 0.5; r > rimFree && i < 2; i += 1, r -= 1.2) rim.push(circle(p, r, w, 5 + i));
  return { center, rim, text, mark };
}

export function decorPaths(p: RecordParams, style: DecorStyle, textLines: string[] = [], capHeightMm = 6, watermark = ""): PathPoint[][] {
  const { center, rim, text, mark } = decorParts(p, style, textLines, capHeightMm, watermark);
  return [...center, ...rim, ...text, ...mark];
}

export function emitDecor(w: GcodeWriter, p: RecordParams): void {
  const paths = decorPaths(p, p.decorStyle, p.labelText, p.labelTextHeightMm, p.watermark);
  if (paths.length === 0) return;
  w.comment(`decor: ${p.decorStyle}${p.labelText.filter(Boolean).length ? " + text" : ""}, ${paths.length} paths`);
  // Text goes slower than the patterns: short segments and sharp corners suffer from acceleration.
  for (const path of paths) w.extrudePath(path, path.length < 40 ? p.grooveSpeedMmS : p.baseSpeedMmS, "Top surface");
}
