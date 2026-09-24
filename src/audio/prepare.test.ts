import { describe, expect, it } from "vitest";
import { rms } from "./dsp";
import { playbackPreview, prepareSignal } from "./prepare";
import { concat, silence, tone } from "./synth";
import { DEFAULT_PARAMS, maxDurationSec, withOverrides } from "../record/layout";

describe("prepareSignal", () => {
  const p = DEFAULT_PARAMS;
  it("trims, filters, limits length, normalizes to peak 1", () => {
    const raw = concat(silence(1, p.sampleRate), tone(500, 60, p.sampleRate, 0.3), silence(1, p.sampleRate));
    const y = prepareSignal(raw, p);
    expect(y.length).toBeLessThanOrEqual(Math.ceil(maxDurationSec(p) * p.sampleRate));
    let peak = 0; for (let i = 0; i < y.length; i += 1) peak = Math.max(peak, Math.abs(y[i]));
    expect(peak).toBeCloseTo(1, 2);
  });
  it("a transient at the start does not rob the rest of the track of amplitude", () => {
    // Ostry start sinusa daje przeskok filtrow ~2x wyzszy od stanu ustalonego. Normalizacja
    // Peak normalisation would halve the whole track; the robust version keeps it at full level.
    const y = prepareSignal(tone(440, 20, p.sampleRate, 1), p);
    const steady = rms(y.subarray(p.sampleRate * 5, p.sampleRate * 15));
    expect(steady).toBeGreaterThan(0.9 / Math.SQRT2);
  });
  it("kills 3 kHz content relative to in-band tone", () => {
    const q = withOverrides(p, { riaaPreEmphasis: false });
    const high = prepareSignal(concat(tone(300, 1, p.sampleRate, 1), tone(3000, 1, p.sampleRate, 1)), q);
    const inBand = rms(high.subarray(2000, 7000));
    const outBand = rms(high.subarray(9000, 15000));
    expect(outBand).toBeLessThan(inBand / 30);
  });
  it("drive raises RMS but keeps peak <= 1", () => {
    const raw = tone(300, 2, p.sampleRate, 0.5);
    const a = prepareSignal(raw, withOverrides(p, { driveDb: 0 }));
    const b = prepareSignal(raw, withOverrides(p, { driveDb: 12 }));
    expect(rms(b)).toBeGreaterThan(rms(a) * 1.1);
    let peak = 0;
    for (let i = 0; i < b.length; i += 1) peak = Math.max(peak, Math.abs(b[i]));
    expect(peak).toBeLessThanOrEqual(1);
  });
  it("startSec/lengthSec wybieraja fragment", () => {
    const raw = concat(tone(300, 5, p.sampleRate, 0.5), tone(900, 5, p.sampleRate, 0.5));
    const y = prepareSignal(raw, withOverrides(p, { riaaPreEmphasis: false }), { startSec: 6, lengthSec: 2 });
    expect(Math.abs(y.length - 2 * p.sampleRate)).toBeLessThanOrEqual(2); // the trim may eat a sample at a zero crossing
    // after 6 s only 900 Hz is left, so zero crossings run at about 2*900 per second
    let zc = 0; for (let i = 1; i < y.length; i += 1) if (y[i - 1] < 0 !== y[i] < 0) zc += 1;
    expect(zc / 2 / 2).toBeCloseTo(900, -2);
  });
  it("playbackPreview returns same length", () => {
    const y = prepareSignal(tone(500, 1, p.sampleRate), p);
    expect(playbackPreview(y, p).length).toBe(y.length);
  });
});
