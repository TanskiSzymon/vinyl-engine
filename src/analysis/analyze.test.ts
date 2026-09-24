import { describe, expect, it } from "vitest";
import { concat, silence, tone } from "../audio/synth";
import { analyzeSegments, goertzel } from "./analyze";

describe("goertzel", () => {
  it("measures tone amplitude and rejects other frequencies", () => {
    const x = tone(500, 1, 8000, 0.5);
    expect(goertzel(x, 8000, 500)).toBeCloseTo(0.5 / Math.SQRT2, 2);
    expect(goertzel(x, 8000, 1000)).toBeLessThan(0.01);
  });
});

describe("analyzeSegments", () => {
  it("reports level and SNR vs silence segment, honoring offset", () => {
    const fs = 8000;
    const rec = concat(silence(1, fs), silence(2, fs), tone(500, 2, fs, 0.4));
    const segs = [{ name: "silence", freq: null, start: 0, end: 2 }, { name: "500", freq: 500, start: 2, end: 4 }];
    const rows = analyzeSegments(rec, fs, segs, 1);
    expect(rows[1].levelDb).toBeCloseTo(20 * Math.log10(0.4 / Math.SQRT2), 0);
    expect(rows[1].snrDb).toBeGreaterThan(60);
  });
});
