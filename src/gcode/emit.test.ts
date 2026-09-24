import { describe, expect, it } from "vitest";
import { extrusionPerMm, GcodeWriter, type WriterOpts } from "./emit";

const opts: WriterOpts = { filamentDiameterMm: 1.75, layerHeightMm: 0.2, retractMm: 0.8, retractSpeedMmS: 30, travelSpeedMmS: 200, simplifyTolMm: 0.004, zHopMm: 0.2 };
const sumE = (g: string) => g.split("\n").filter((l) => l.startsWith("G1") && / E/.test(l)).reduce((s, l) => s + Number(/E(-?[\d.]+)/.exec(l)![1]), 0);

describe("GcodeWriter", () => {
  it("extrudes a 10 mm square with correct total E", () => {
    const w = new GcodeWriter(opts);
    w.layer(0.2);
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }].map((p) => ({ ...p, w: 0.42 }));
    w.extrudePath(sq, 30);
    const g = w.toString();
    expect(sumE(g)).toBeCloseTo(40 * extrusionPerMm(0.42, 0.2, 1.75), 3);
    expect(w.stats().pathLengthMm).toBeCloseTo(40, 3);
    expect(g).toContain("G1 Z0.2 F600");
  });
  it("tags paths with FEATURE and LINE_WIDTH when a role is given", () => {
    const w = new GcodeWriter(opts);
    w.layer(0.2);
    w.extrudePath([{ x: 0, y: 0, w: 0.5 }, { x: 5, y: 0, w: 0.5 }], 30, "Bottom surface");
    expect(w.toString()).toContain("; FEATURE: Bottom surface\n; LINE_WIDTH: 0.50\n");
  });
  it("first travel retracts and lifts before crossing the bed, then primes", () => {
    const w = new GcodeWriter(opts);
    w.layer(0.2);
    w.extrudePath([{ x: 10, y: 10, w: 0.42 }, { x: 20, y: 10, w: 0.42 }], 30);
    const lines = w.toString().split("\n");
    const iXY = lines.findIndex((l) => l.startsWith("G1 X10 Y10"));
    expect(lines[iXY - 1]).toBe("G1 E-0.8 F1800");
    expect(lines[iXY]).toBe("G1 X10 Y10 Z0.6 F12000");
    expect(lines[iXY + 1]).toBe("G1 Z0.2 F600");
    expect(lines[iXY + 2]).toBe("G1 E0.8 F1800");
  });
  it("emits Bambu layer markers and a monotone progress bar", () => {
    const w = new GcodeWriter(opts);
    w.setTotalLayers(2);
    w.layer(0.2); w.extrudePath([{ x: 0, y: 0, w: 0.42 }, { x: 100, y: 0, w: 0.42 }], 30);
    w.layer(0.4); w.extrudePath([{ x: 100, y: 0, w: 0.42 }, { x: 0, y: 0, w: 0.42 }], 30);
    const g = w.toString();
    expect(g).toContain("; layer num/total_layer_count: 1/2");
    expect(g).toContain("; layer num/total_layer_count: 2/2");
    expect(g).toContain("M73 L1"); expect(g).toContain("M73 L2");
    expect(g).toContain("M991 S0 P0"); expect(g).toContain("M991 S0 P1");
    expect(g).toContain("; LAYER_HEIGHT: 0.2");
    const progress = [...g.matchAll(/^M73 P(\d+) R(\d+)$/gm)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(progress.length).toBe(2);
    expect(progress[0][0]).toBe(0);
    expect(progress[1][0]).toBeGreaterThan(progress[0][0]);
    expect(progress[1][1]).toBeLessThan(progress[0][1] + 1);
  });
  it("retract after a path is a wipe along the last ~2 mm summing to -retractMm", () => {
    const w = new GcodeWriter(opts);
    w.layer(0.2);
    // a zigzag, so simplification cannot merge the segments (a wipe needs at least 2 emitted points)
    w.extrudePath([{ x: 0, y: 0, w: 0.42 }, { x: 5, y: 0, w: 0.42 }, { x: 5, y: 1, w: 0.42 }, { x: 6, y: 1, w: 0.42 }, { x: 6, y: 0, w: 0.42 }, { x: 7, y: 0, w: 0.42 }], 30);
    w.extrudePath([{ x: 20, y: 20, w: 0.42 }, { x: 25, y: 20, w: 0.42 }], 30);
    const g = w.toString();
    const wipe = g.slice(g.indexOf("; WIPE_START"), g.indexOf("; WIPE_END"));
    const e = [...wipe.matchAll(/E-([\d.]+)/g)].reduce((a, m) => a + Number(m[1]), 0);
    expect(e).toBeCloseTo(0.8, 3);
    expect(wipe).toContain("G1 X6 Y0"); // it retraces the path
  });
  it("collapses collinear points into one segment", () => {
    const w = new GcodeWriter(opts);
    w.layer(0.2);
    const pts = Array.from({ length: 100 }, (_, i) => ({ x: i * 0.1, y: 0, w: 0.42 }));
    w.extrudePath(pts, 30);
    const moves = w.toString().split("\n").filter((l) => l.startsWith("G1 X") && / E/.test(l) && !/E-/.test(l));
    expect(moves.length).toBe(1);
  });
  it("keeps points that deviate more than tolerance", () => {
    const w = new GcodeWriter(opts);
    w.layer(0.2);
    const pts = Array.from({ length: 100 }, (_, i) => ({ x: i * 0.1, y: 0.05 * Math.sin(i), w: 0.42 }));
    w.extrudePath(pts, 30);
    const moves = w.toString().split("\n").filter((l) => l.startsWith("G1 X") && / E/.test(l) && !/E-/.test(l));
    expect(moves.length).toBeGreaterThan(50);
  });
});
