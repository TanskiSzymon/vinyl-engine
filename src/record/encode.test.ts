// An end-to-end test: does the geometry written into the G-code really carry the sound that went
// in? The path is read back out of the finished G-code (not from the geometry functions), the
// spiral trend is subtracted and the cycles per revolution are counted, which is exactly the
// operation a stylus performs.
import { describe, expect, it } from "vitest";
import { tone } from "../audio/synth";
import { buildRecordGcode } from "./build";
import { DEFAULT_PARAMS, withOverrides } from "./layout";

const TWO_PI = 2 * Math.PI;

/**
 * Extracts the LAST extrusion path in the file. In buildRecordGcode the order inside a groove
 * layer is land, wall L, wall R, so the last one is wall R. (The longest path in the file is the
 * base spiral, which is why it must not be picked by length.)
 */
function lastPath(gcode: string): { x: number; y: number }[] {
  let cur: { x: number; y: number }[] = [];
  for (const line of gcode.split("\n")) {
    if (/ E-/.test(line)) { cur = []; continue; } // retrakcja (takze wipe "G1 X Y E-") = koniec sciezki
    if (line.startsWith("G1 X") && / E/.test(line)) {
      cur.push({ x: Number(/X(-?[\d.]+)/.exec(line)![1]), y: Number(/Y(-?[\d.]+)/.exec(line)![1]) });
    }
  }
  return cur;
}

/** Cycles per revolution in the window [th0, th1): removes the linear trend (the spiral pitch)
 *  and counts zero crossings. */
function cyclesPerRev(pts: { x: number; y: number }[], cx: number, cy: number, th0: number, th1: number): { cpr: number; amp: number } {
  let prev: number | null = null, un = 0;
  const seg: { t: number; r: number }[] = [];
  for (const p of pts) {
    const r = Math.hypot(p.x - cx, p.y - cy);
    const th = Math.atan2(p.y - cy, p.x - cx);
    if (prev !== null) {
      let d = th - prev;
      while (d > Math.PI) d -= TWO_PI;
      while (d < -Math.PI) d += TWO_PI;
      un += d;
    }
    prev = th;
    if (un >= th0 && un < th1) seg.push({ t: un, r });
  }
  const n = seg.length;
  const sx = seg.reduce((a, s) => a + s.t, 0), sy = seg.reduce((a, s) => a + s.r, 0);
  const sxx = seg.reduce((a, s) => a + s.t * s.t, 0), sxy = seg.reduce((a, s) => a + s.t * s.r, 0);
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
  const res = seg.map((s) => s.r - (a + b * s.t));
  let cross = 0, amp = 0;
  for (let i = 1; i < res.length; i += 1) {
    if (res[i - 1] < 0 !== res[i] < 0) cross += 1;
    amp = Math.max(amp, Math.abs(res[i]));
  }
  return { cpr: cross / 2 / ((th1 - th0) / TWO_PI), amp };
}

describe("kodowanie dzwieku w geometrii", () => {
  it("the path in the G-code carries 800 Hz at 78 rpm with amplitude A", () => {
    const p = withOverrides(DEFAULT_PARAMS, { diameterMm: 200, outerGrooveR: 96, baseLayers: 1, riaaPreEmphasis: false });
    const { gcode } = buildRecordGcode(p, tone(800, 3, p.sampleRate, 1), "; H\n", "; F\n");
    const path = lastPath(gcode);
    const rps = p.rpm / 60;
    // okno: od 0.5 s do 2.5 s muzyki (po lead-in)
    const th0 = TWO_PI * (p.leadInTurns + 0.5 * rps), th1 = TWO_PI * (p.leadInTurns + 2.5 * rps);
    const { cpr, amp } = cyclesPerRev(path, p.centerX, p.centerY, th0, th1);
    expect(cpr * rps).toBeCloseTo(800, -1);          // +-5 Hz
    // The peak comes out about 4% below A: at 8 kHz there are 10 samples per 800 Hz period, so the
    // highest sample is sin(72 deg) = 0.951. That is the sampling grid, not an error.
    expect(amp).toBeGreaterThan(0.93 * p.amplitudeMm);
    expect(amp).toBeLessThanOrEqual(p.amplitudeMm + 0.002);
  });
  it("silence gives a smooth spiral with no modulation", () => {
    const p = withOverrides(DEFAULT_PARAMS, { diameterMm: 200, outerGrooveR: 96, baseLayers: 1 });
    const { gcode } = buildRecordGcode(p, new Float32Array(p.sampleRate * 3), "; H\n", "; F\n");
    const path = lastPath(gcode);
    const rps = p.rpm / 60;
    const { amp } = cyclesPerRev(path, p.centerX, p.centerY, TWO_PI * (p.leadInTurns + 0.5 * rps), TWO_PI * (p.leadInTurns + 2.5 * rps));
    expect(amp).toBeLessThan(0.01);
  });
});
