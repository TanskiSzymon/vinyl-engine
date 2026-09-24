import { describe, expect, it } from "vitest";
import { tone } from "../audio/synth";
import { buildRecordGcode, buildRingsGcode } from "./build";
import { DEFAULT_PARAMS, withOverrides } from "./layout";
import { matrixRings, QUICK_RING_DEFS } from "../programs";

describe("buildRingsGcode", () => {
  it("emits one groove layer per max wallLayers and all rings", () => {
    const p = withOverrides(DEFAULT_PARAMS, { baseLayers: 1 });
    const rings = matrixRings(p);
    const { gcode } = buildRingsGcode(p, rings, "; H\n", "; F\n");
    expect((gcode.match(/; CHANGE_LAYER/g) ?? []).length).toBe(1 + Math.max(...rings.map((r) => r.wallLayers)));
    expect((gcode.match(/; ring /g) ?? []).length).toBe(rings.reduce((a, r) => a + r.wallLayers, 0));
  });
});

describe("tryb ekstruzji", () => {
  it("M83 (relative E) is the last mode command before the first extrusion, so G90 cannot undo it", () => {
    const p = withOverrides(DEFAULT_PARAMS, { diameterMm: 200, outerGrooveR: 96, baseLayers: 1 });
    for (const gcode of [
      buildRecordGcode(p, tone(500, 1, p.sampleRate), "; H\n", "; F\n").gcode,
      buildRingsGcode(p, matrixRings(p, QUICK_RING_DEFS), "; H\n", "; F\n").gcode,
    ]) {
      const body = gcode.slice(gcode.indexOf("vinyl-engine"));
      const firstE = body.search(/^G1 [^\n]*E/m);
      const lastMode = Math.max(body.lastIndexOf("\nM83", firstE), body.lastIndexOf("\nM82", firstE), body.lastIndexOf("\nG90", firstE), body.lastIndexOf("\nG91", firstE));
      expect(body.slice(lastMode + 1, lastMode + 4)).toBe("M83");
    }
  });
});

describe("buildRecordGcode", () => {
  it("assembles header, base layers, groove layers, footer with sane stats", () => {
    const p = withOverrides(DEFAULT_PARAMS, { diameterMm: 200, outerGrooveR: 96, baseLayers: 2 });
    const { gcode, stats } = buildRecordGcode(p, tone(1000, 2, p.sampleRate), "; HEADER\nM83\n", "; FOOTER\nM104 S0\n");
    expect(gcode.startsWith("; HEADER")).toBe(true);
    expect(gcode.trimEnd().endsWith("M104 S0")).toBe(true);
    expect((gcode.match(/; CHANGE_LAYER/g) ?? []).length).toBe(p.baseLayers + p.wallLayers);
    expect(stats.timeSec).toBeGreaterThan(60);
    expect(stats.timeSec).toBeLessThan(4 * 3600);
    expect(stats.musicSec).toBeCloseTo(2, 0);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const l of gcode.split("\n")) if (l.startsWith("G1 X")) {
      const x = Number(/X(-?[\d.]+)/.exec(l)![1]), y = Number(/Y(-?[\d.]+)/.exec(l)![1]);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    expect(minX).toBeGreaterThan(27); expect(maxX).toBeLessThan(229);
    expect(minY).toBeGreaterThan(27); expect(maxY).toBeLessThan(229);
  });
});

describe("zmiana koloru i zdobienie", () => {
  it("the pause falls exactly between the last base layer and the first groove layer", () => {
    const p = withOverrides(DEFAULT_PARAMS, { diameterMm: 200, outerGrooveR: 96, baseLayers: 3, colorChange: true });
    const { gcode } = buildRecordGcode(p, tone(500, 2, p.sampleRate), "; H\n", "; F\n");
    const lines = gcode.split("\n");
    const pause = lines.findIndex((l) => l.startsWith("M400 U1"));
    expect(pause).toBeGreaterThan(0);
    // the markers the Bambu Studio preview reads must have no space after the semicolon
    expect(lines).toContain(";COLOR_CHANGE,T0");
    expect(lines).toContain(";PAUSE_PRINT");
    const before = lines.slice(0, pause).filter((l) => l.startsWith("; base layer")).length;
    const after = lines.slice(pause).filter((l) => l.startsWith("; groove layer")).length;
    expect(before).toBe(3);
    expect(after).toBe(p.wallLayers);
    expect(lines.slice(pause).some((l) => l.startsWith("; base layer"))).toBe(false);
  });
  it("without the flag there is no pause at all", () => {
    const p = withOverrides(DEFAULT_PARAMS, { diameterMm: 200, outerGrooveR: 96, baseLayers: 2 });
    expect(buildRecordGcode(p, tone(500, 1, p.sampleRate), "; H\n", "; F\n").gcode).not.toContain("M400 U1");
  });
  it("the decoration lands in the groove layers, and only there", () => {
    const p = withOverrides(DEFAULT_PARAMS, { diameterMm: 200, outerGrooveR: 96, baseLayers: 2, decorStyle: "rosette" });
    const gcode = buildRecordGcode(p, tone(500, 1, p.sampleRate), "; H\n", "; F\n").gcode;
    expect((gcode.match(/; decor: rosette/g) ?? []).length).toBe(1);
    const decorAt = gcode.indexOf("; decor:");
    expect(gcode.slice(0, decorAt)).toContain("; groove layer 1/");
  });
});
