import { describe, expect, it } from "vitest";
import { grooveProfile } from "../record/groove";
import { DEFAULT_PARAMS, pitchMm, withOverrides } from "../record/layout";
import { grooveLayerPaths } from "./grooveLayers";

const TWO_PI = 2 * Math.PI;
const r = (pt: { x: number; y: number }) => Math.hypot(pt.x - 128, pt.y - 128);

/**
 * The radius of a path at a given UNWRAPPED angle. Every path's seam is scattered now, so point
 * [0] of different paths sits at a different angle: they are compared by angle, not by index.
 */
function radiusAt(path: { x: number; y: number }[], theta: number): number {
  let prev: number | null = null, un = 0, best = 0, bestD = Infinity;
  for (const pt of path) {
    const a = Math.atan2(pt.y - 128, pt.x - 128);
    if (prev === null) { un = a; } else {
      let d = a - prev;
      while (d > Math.PI) d -= TWO_PI;
      while (d < -Math.PI) d += TWO_PI;
      un += d;
    }
    prev = a;
    const dist = Math.abs(un - theta);
    if (dist < bestD) { bestD = dist; best = r(pt); }
  }
  return best;
}

describe("grooveLayerPaths", () => {
  const p = DEFAULT_PARAMS;
  const g = grooveProfile(p, 3);
  it("left/right walls are one bead apart around the unmodulated base", () => {
    const { left, right } = grooveLayerPaths(p, g, () => 0, 0);
    const L = radiusAt(left, 0), R = radiusAt(right, 0);
    expect(L - R).toBeCloseTo(p.beadWidthMm + p.grooveGapMm, 2);
    expect((L + R) / 2).toBeCloseTo(p.outerGrooveR, 2);
  });
  it("land is split into beads that fill pitch - 2*bead and shrink with next-turn offset", () => {
    const flat = grooveLayerPaths(p, g, () => 0, 0);
    const nominal = pitchMm(p) - 2 * p.beadWidthMm - p.grooveGapMm; // 2*A + landMin, in layer 0
    expect(flat.lands.length).toBe(Math.max(1, Math.round(nominal / 0.6)));
    const perBead = (nominal - 0.06) / flat.lands.length;
    expect(flat.lands[0][10].w).toBeCloseTo(Math.min(0.55, perBead), 2);
    const th1 = g.thetaMusicStart;
    // an excursion of +0.1 in the second musical turn only, so the land between turn 1 and 2 narrows
    const shifted = grooveLayerPaths(p, g, (th) => (th >= th1 + TWO_PI && th < th1 + 2 * TWO_PI ? 0.1 : 0), 0);
    const narrow = shifted.lands[0].find((pt) => pt.w < Math.min(0.55, perBead) - 0.05);
    expect(narrow).toBeDefined();
    // every land bead between the walls of neighbouring turns
    let minW = Infinity;
    for (const bead of flat.lands) for (const pt of bead) minW = Math.min(minW, pt.w);
    expect(minW).toBeGreaterThanOrEqual(0.25);
  });
  it("wider land (bigger amplitude) is split into more beads", () => {
    const p2 = withOverrides(p, { amplitudeMm: 0.25, landMinMm: 0.75 }); // nominal 1.25 mm
    const g2 = grooveProfile(p2, 3);
    const lands = grooveLayerPaths(p2, g2, () => 0, 0).lands;
    expect(lands.length).toBe(2);
    for (const bead of lands) expect(bead[10].w).toBeCloseTo(Math.min(0.55, (1.25 - 0.06) / 2), 2);
  });
  it("land is drawn in every wall layer and narrows as the V opens", () => {
    const k0 = grooveLayerPaths(p, g, () => 0, 0), k2 = grooveLayerPaths(p, g, () => 0, 2);
    expect(k2.lands.length).toBeGreaterThan(0);
    const width = (paths: typeof k0) => paths.lands.reduce((a, bead) => a + bead[10].w, 0);
    expect(width(k2)).toBeLessThan(width(k0));
    // the wall spacing grows by 2*wallStep per layer
    const spread = (x: typeof k0) => radiusAt(x.left, 0) - radiusAt(x.right, 0);
    expect(spread(k2) - spread(k0)).toBeCloseTo(4 * p.wallStepMm, 2);
  });
  it("second wall layer is stepped outward", () => {
    const p2 = withOverrides(p, { wallLayers: 2 });
    const a = grooveLayerPaths(p2, g, () => 0, 0), b = grooveLayerPaths(p2, g, () => 0, 1);
    expect(radiusAt(b.left, 0) - radiusAt(a.left, 0)).toBeCloseTo(p2.wallStepMm, 2);
  });
  it("innermost point stays above innerGrooveR", () => {
    const { right } = grooveLayerPaths(p, grooveProfile(p, 1000), () => 0, 0);
    let minR = Infinity;
    for (const pt of right) minR = Math.min(minR, r(pt));
    expect(minR).toBeGreaterThanOrEqual(p.innerGrooveR - pitchMm(p));
  });
});
