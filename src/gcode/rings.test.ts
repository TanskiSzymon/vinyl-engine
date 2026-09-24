import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "../record/layout";
import { ringLayerPaths, type Ring } from "./rings";

const r = (pt: { x: number; y: number }) => Math.hypot(pt.x - 128, pt.y - 128);
const ring = (o: Partial<Ring>): Ring => ({ radiusMm: 100, grooveGapMm: 0, amplitudeMm: 0.15, wallLayers: 1, wallStepMm: 0.12, cyclesPerRev: 100, freqHz: 130, note: "", ...o });

describe("ringLayerPaths", () => {
  const p = DEFAULT_PARAMS;
  it("walls are closed loops one bead apart, modulated by the sine", () => {
    const { walls } = ringLayerPaths(p, [ring({})], 0);
    expect(walls.length).toBe(2);
    const [L, R] = walls;
    expect(r(L[0]) - r(R[0])).toBeCloseTo(p.beadWidthMm, 3);
    expect(Math.hypot(L[0].x - L[L.length - 1].x, L[0].y - L[L.length - 1].y)).toBeLessThan(0.01);
    const radii = L.map(r);
    expect(Math.max(...radii) - Math.min(...radii)).toBeCloseTo(2 * 0.15, 1);
  });
  it("silent ring is a perfect circle", () => {
    const { walls } = ringLayerPaths(p, [ring({ amplitudeMm: 0, cyclesPerRev: 0 })], 0);
    const radii = walls[0].map(r);
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-6);
  });
  it("land between two rings is split into beads that stay between the walls", () => {
    const rings = [ring({ radiusMm: 100 }), ring({ radiusMm: 97 })];
    const { lands } = ringLayerPaths(p, rings, 0);
    const nominal = 3 - 2 * (p.beadWidthMm / 2 + p.beadWidthMm / 2); // 3 - 0.84 = 2.16
    expect(lands.length).toBe(Math.round(nominal / 0.6));
    let minW = Infinity, maxW = 0, minR = Infinity, maxR = 0;
    for (const bead of lands) for (const pt of bead) {
      minW = Math.min(minW, pt.w); maxW = Math.max(maxW, pt.w);
      minR = Math.min(minR, r(pt)); maxR = Math.max(maxR, r(pt));
    }
    expect(minW).toBeGreaterThanOrEqual(0.25);
    expect(maxW).toBeLessThanOrEqual(0.7);
    expect(maxR).toBeLessThan(100 - 0.36);
    expect(minR).toBeGreaterThan(97 + 0.36);
  });
  it("layer k>0 only includes rings with wallLayers > k, stepped outward; land only between rings present in that layer", () => {
    // amplitude 0: each layer's seam starts at a different angle, so radii are compared unmodulated
    const rings = [ring({ radiusMm: 100, wallLayers: 2, amplitudeMm: 0 }), ring({ radiusMm: 97, wallLayers: 1, amplitudeMm: 0 })];
    const a = ringLayerPaths(p, rings, 0), b = ringLayerPaths(p, rings, 1);
    expect(a.walls.length).toBe(4);
    expect(b.walls.length).toBe(2);
    expect(r(b.walls[0][0]) - r(a.walls[0][0])).toBeCloseTo(0.12, 3);
    expect(a.lands.length).toBeGreaterThan(0);
    expect(b.lands.length).toBe(0);
    const both = [ring({ radiusMm: 100, wallLayers: 3 }), ring({ radiusMm: 96, wallLayers: 3 })];
    expect(ringLayerPaths(p, both, 2).lands.length).toBeGreaterThan(0);
  });
});
