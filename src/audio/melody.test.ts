import { describe, expect, it } from "vitest";
import { rms } from "./dsp";
import { renderMelody } from "./melody";
import { goertzel } from "../analysis/analyze";

describe("renderMelody", () => {
  const fs = 8000;
  it("first note is E5 (659 Hz), second B4 (494 Hz) at 144 bpm", () => {
    const y = renderMelody(fs, 3);
    const beat = 60 / 144;
    const seg = (a: number, b: number) => y.subarray(Math.round(a * fs), Math.round(b * fs));
    const e5 = seg(0.05, beat * 0.85), b4 = seg(beat + 0.05, beat * 1.45);
    expect(goertzel(e5, fs, 659.25)).toBeGreaterThan(goertzel(e5, fs, 493.88) * 5);
    expect(goertzel(b4, fs, 493.88)).toBeGreaterThan(goertzel(b4, fs, 659.25) * 5);
  });
  it("fills the requested length and loops", () => {
    const y = renderMelody(fs, 40);
    expect(y.length).toBe(40 * fs);
    expect(rms(y.subarray(35 * fs))).toBeGreaterThan(0.05);
  });
  it("high notes are quieter (constant velocity above the knee)", () => {
    const a5 = renderMelody(fs, 0.4, [["A5", 1]]), a4 = renderMelody(fs, 0.4, [["A4", 1]]);
    expect(rms(a5) / rms(a4)).toBeCloseTo(500 / 880, 1);
  });
});
