import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "../record/layout";
import { baseLayerPaths } from "./base";

const r = (pt: { x: number; y: number }) => Math.hypot(pt.x - 128, pt.y - 128);

describe("baseLayerPaths", () => {
  it("even layers spiral from hole to rim, plus two perimeters, all inside the disc", () => {
    const paths = baseLayerPaths(DEFAULT_PARAMS, 2);
    expect(paths.length).toBe(3);
    const [spiral] = paths;
    expect(r(spiral[0])).toBeCloseTo(DEFAULT_PARAMS.holeMm / 2 + 0.21 + 0.42, 1); // one bead beyond the hole perimeter
    expect(r(spiral[spiral.length - 1])).toBeCloseTo(125 - 0.21 - 0.42, 1);
    let maxR = 0;
    for (const path of paths) for (const pt of path) maxR = Math.max(maxR, r(pt));
    expect(maxR).toBeLessThanOrEqual(125.001);
  });
  it("odd layers run rim->hole, so each layer starts where the previous one ended", () => {
    const [spiral] = baseLayerPaths(DEFAULT_PARAMS, 1);
    expect(r(spiral[0])).toBeGreaterThan(r(spiral[spiral.length - 1]));
  });
  it("first layer uses wider bead and a slightly larger hole (elephant foot)", () => {
    const paths = baseLayerPaths(DEFAULT_PARAMS, 0);
    expect(paths[0][0].w).toBeCloseTo(0.5);
    const holeCircle = paths[2];
    expect(r(holeCircle[0])).toBeCloseTo(DEFAULT_PARAMS.holeMm / 2 + 0.15 + 0.25, 2);
  });
  it("hole perimeter and spiral start do not overlap", () => {
    const [spiral, , hole] = baseLayerPaths(DEFAULT_PARAMS, 2); // an even layer spirals out from the hole
    expect(r(spiral[0]) - r(hole[0])).toBeCloseTo(0.42, 2);
  });
});
