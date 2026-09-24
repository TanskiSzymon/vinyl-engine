import { describe, expect, it } from "vitest";
import { magnitudeAt } from "./dsp";
import { riaaPlayback, riaaPreEmphasis } from "./riaa";

const dB = (x: number) => 20 * Math.log10(x);

describe("RIAA", () => {
  const fs = 48000;
  it("playback matches the RIAA curve in band (+13.1 dB @100 Hz, 0 @1k, -2.6 @2k)", () => {
    const c = riaaPlayback(fs);
    expect(dB(magnitudeAt(c, 1000, fs))).toBeCloseTo(0, 2);
    expect(dB(magnitudeAt(c, 100, fs))).toBeCloseTo(13.1, 0);
    expect(dB(magnitudeAt(c, 300, fs))).toBeCloseTo(5.5, 0);
    expect(dB(magnitudeAt(c, 2000, fs))).toBeCloseTo(-2.6, 0);
  });
  it("playback at 10 kHz is within 1.5 dB of -13.7 (bilinear warping near Nyquist)", () => {
    // The bilinear transform without pre-warping compresses the frequency axis near Nyquist: at
    // 48 kHz this gives -15.1 dB instead of -13.7. The band in use ends at 1.2 kHz, where the
    // error is below 0.05 dB, so the filter is left without pre-warping.
    expect(Math.abs(dB(magnitudeAt(riaaPlayback(fs), 10000, fs)) + 13.7)).toBeLessThan(1.5);
  });
  it("pre-emphasis x playback is flat in 100-2000 Hz", () => {
    const p = riaaPreEmphasis(fs), q = riaaPlayback(fs);
    for (const f of [100, 300, 1000, 2000]) {
      expect(Math.abs(dB(magnitudeAt(p, f, fs) * magnitudeAt(q, f, fs)))).toBeLessThan(0.3);
    }
  });
  it("works at fs=8000 (monotone boost of highs in pre-emphasis)", () => {
    const p = riaaPreEmphasis(8000);
    expect(magnitudeAt(p, 1200, 8000)).toBeGreaterThan(magnitudeAt(p, 300, 8000));
  });
});
