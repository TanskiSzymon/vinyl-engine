import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, withOverrides } from "../record/layout";
import { DECOR_STYLES, decorPaths, decorZone, labelTextPaths } from "./decor";

const r = (pt: { x: number; y: number }) => Math.hypot(pt.x - 128, pt.y - 128);
const p = DEFAULT_PARAMS;

describe("decorPaths", () => {
  it("none draws nothing", () => { expect(decorPaths(p, "none")).toEqual([]); });

  it.each(DECOR_STYLES.filter((s) => s !== "none"))("%s stays in the free field and never enters the grooves", (style) => {
    const z = decorZone(p);
    const paths = decorPaths(p, style);
    expect(paths.length).toBeGreaterThanOrEqual(2); // the spiral is one path plus the rim border
    let minR = Infinity, maxR = 0, inGroove = 0;
    for (const path of paths) for (const pt of path) {
      const rr = r(pt);
      minR = Math.min(minR, rr); maxR = Math.max(maxR, rr);
      if (rr > z.rMax + 0.01 && rr < p.outerGrooveR + 0.5) inGroove += 1; // the groove band
    }
    expect(minR).toBeGreaterThanOrEqual(p.holeMm / 2 + 1);
    expect(maxR).toBeLessThanOrEqual(p.diameterMm / 2);
    expect(inGroove).toBe(0);
  });

  it("text fits the label field and the pattern keeps clear of it", () => {
    const lines = ["THE ENTERTAINER", "SCOTT JOPLIN"];
    const withText = decorPaths(p, "rings", lines, 6);
    const textOnly = labelTextPaths(p, lines, 6, p.beadWidthMm);
    expect(textOnly.length).toBeGreaterThan(10);
    const z = decorZone(p);
    let maxTextR = 0;
    for (const path of textOnly) for (const pt of path) maxTextR = Math.max(maxTextR, r(pt));
    expect(maxTextR).toBeLessThan(z.rMax);
    // the rings (long closed paths) start further out than the text reaches
    const rings = withText.filter((path) => path.length > 100);
    let minRingR = Infinity;
    for (const path of rings) for (const pt of path) minRingR = Math.min(minRingR, r(pt));
    expect(minRingR).toBeGreaterThan(maxTextR - 1);
    // without text those same rings come much closer to the centre
    const noText = decorPaths(p, "rings", [], 6).filter((path) => path.length > 100);
    let minNoText = Infinity;
    for (const path of noText) for (const pt of path) minNoText = Math.min(minNoText, r(pt));
    expect(minNoText).toBeLessThan(minRingR - 5);
  });

  it("no text means no text paths", () => {
    expect(labelTextPaths(p, [], 6, 0.42)).toEqual([]);
    expect(labelTextPaths(p, ["  "], 6, 0.42)).toEqual([]);
  });

  it("leaves the middle empty when the free field is too narrow", () => {
    const tiny = withOverrides(p, { holeMm: 110 }); // a field of 57.5..60 mm, so 2.5 mm
    const z = decorZone(tiny);
    expect(z.rMax - z.rMin).toBeLessThan(6);
    const paths = decorPaths(tiny, "rosette");
    for (const path of paths) for (const pt of path) expect(r(pt)).toBeGreaterThan(tiny.outerGrooveR); // only the rim border is left
  });
});
