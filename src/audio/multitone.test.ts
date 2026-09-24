import { describe, expect, it } from "vitest";
import { goertzel } from "../analysis/analyze";
import { MULTITONE_FREQS, multitone } from "./multitone";
import { resample } from "./resample";
import { tone } from "./synth";
import { rms } from "./dsp";

describe("multitone", () => {
  it("contains every tone at equal level and peak <= 0.9", () => {
    const x = multitone(1.2, 8000);
    const levels = MULTITONE_FREQS.map((f) => goertzel(x, 8000, f));
    const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
    for (const l of levels) expect(Math.abs(20 * Math.log10(l / mean))).toBeLessThan(0.5);
    expect(goertzel(x, 8000, 800)).toBeLessThan(mean / 20);
    let peak = 0; for (let i = 0; i < x.length; i += 1) peak = Math.max(peak, Math.abs(x[i]));
    expect(peak).toBeCloseTo(0.9, 2);
  });
});

describe("resample", () => {
  it("44100 -> 8000 keeps a 440 Hz tone and its rms", () => {
    const y = resample(tone(440, 1, 44100, 0.5), 44100, 8000);
    expect(Math.abs(y.length - 8000)).toBeLessThan(3);
    expect(rms(y.subarray(500))).toBeCloseTo(0.5 / Math.SQRT2, 1);
    expect(goertzel(y.subarray(500), 8000, 440)).toBeGreaterThan(goertzel(y.subarray(500), 8000, 600) * 20);
  });
});
