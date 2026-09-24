import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, musicStartR, pitchMm } from "./layout";
import { grooveProfile, offsetFn, polarPath, sampleAt } from "./groove";

const TWO_PI = 2 * Math.PI;

describe("sampleAt", () => {
  it("interpolates linearly and is 0 outside", () => {
    const s = new Float32Array([0, 1, 0]);
    expect(sampleAt(s, 10, 0.05)).toBeCloseTo(0.5);
    expect(sampleAt(s, 10, -1)).toBe(0);
    expect(sampleAt(s, 10, 5)).toBe(0);
  });
});

describe("polarPath", () => {
  it("walks counter-clockwise with ~spacing along arc", () => {
    const pts = polarPath({ cx: 0, cy: 0, thetaStart: 0, thetaEnd: TWO_PI, spacingMm: 1, radius: () => 10, width: 0.42 });
    expect(pts.length).toBeGreaterThan(60);
    expect(pts[0].x).toBeCloseTo(10); expect(pts[0].y).toBeCloseTo(0);
    expect(pts[Math.round(pts.length / 4)].y).toBeGreaterThan(0); // po cwierci obrotu y > 0 = CCW
    expect(pts[pts.length - 1].x).toBeCloseTo(10, 3);
  });
});

describe("grooveProfile", () => {
  const p = DEFAULT_PARAMS;
  it("lead-in, music, lead-out, locked", () => {
    const g = grooveProfile(p, 10);
    const pitch = pitchMm(p);
    expect(g.musicTurns).toBe(13); // ceil(10 s * 78/60)
    expect(g.rBase(0)).toBeCloseTo(p.outerGrooveR);
    expect(g.rBase(TWO_PI * p.leadInTurns)).toBeCloseTo(musicStartR(p));
    expect(g.rBase(TWO_PI * (p.leadInTurns + 13))).toBeCloseTo(musicStartR(p) - 13 * pitch);
    expect(g.rBase(g.thetaEnd)).toBeCloseTo(musicStartR(p) - 14 * pitch);
    expect(g.timeAt(0)).toBeNull();
    expect(g.timeAt(TWO_PI * p.leadInTurns + TWO_PI)).toBeCloseTo(60 / 78);
  });
  it("caps music turns at capacity", () => {
    expect(grooveProfile(p, 1000).musicTurns).toBeLessThanOrEqual(40);
  });
  it("offsetFn scales the signal by the amplitude and ramps it in and out", () => {
    const g = grooveProfile(p, 3);
    const sig = new Float32Array(3 * p.sampleRate).fill(1);
    const o = offsetFn(p, g, sig);
    const omega = (TWO_PI * p.rpm) / 60;
    const atSec = (t: number) => o(TWO_PI * p.leadInTurns + t * omega);
    expect(o(0)).toBe(0);                                   // rozbieg bez modulacji
    expect(atSec(0.01)).toBeLessThan(p.amplitudeMm * 0.1);  // nabieg
    expect(atSec(1.5)).toBeCloseTo(p.amplitudeMm, 3);       // pelna amplituda w srodku
    expect(atSec(2.99)).toBeLessThan(p.amplitudeMm * 0.2);  // wybieg
  });
});
