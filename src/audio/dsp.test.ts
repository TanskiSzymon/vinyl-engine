import { describe, expect, it } from "vitest";
import { applyBiquad, applyChain, butterworthLowpass4, compress, highpass, highShelf, lowpass, magnitudeAt, normalizePeak, rms, trimSilence } from "./dsp";

const fs = 8000;
function tone(f: number, sec: number): Float32Array {
  const n = Math.round(sec * fs);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = Math.sin((2 * Math.PI * f * i) / fs);
  return out;
}

describe("biquad", () => {
  it("lowpass passes 100 Hz and kills 3500 Hz", () => {
    const c = lowpass(1000, fs);
    expect(magnitudeAt(c, 100, fs)).toBeCloseTo(1, 1);
    expect(magnitudeAt(c, 3500, fs)).toBeLessThan(0.15);
  });
  it("highpass kills DC", () => {
    const y = applyBiquad(new Float32Array(4000).fill(1), highpass(80, fs));
    expect(Math.abs(y[3999])).toBeLessThan(0.01);
  });
  it("butterworth4 attenuates 2400 Hz by >30 dB at fc=1200", () => {
    const chain = butterworthLowpass4(1200, fs);
    const y = applyChain(tone(2400, 1), chain);
    expect(rms(y.subarray(2000))).toBeLessThan(Math.SQRT1_2 / 30);
    const pass = applyChain(tone(300, 1), chain);
    expect(rms(pass.subarray(2000))).toBeCloseTo(Math.SQRT1_2, 1);
  });
});

describe("highShelf", () => {
  it("podbija gore o zadane dB, dol zostawia", () => {
    const c = highShelf(400, fs, 6);
    expect(20 * Math.log10(magnitudeAt(c, 1500, fs))).toBeCloseTo(6, 0);
    expect(20 * Math.log10(magnitudeAt(c, 60, fs))).toBeCloseTo(0, 0);
  });
});

describe("compress", () => {
  it("zmniejsza rozpietosc miedzy cichym a glosnym fragmentem", () => {
    const loud = tone(300, 1), quiet = Float32Array.from(tone(300, 1), (v) => v * 0.1);
    const x = new Float32Array(loud.length + quiet.length);
    x.set(loud); x.set(quiet, loud.length);
    const y = compress(x, fs, -20, 4);
    const before = rms(loud.subarray(2000)) / rms(quiet.subarray(2000));
    const after = rms(y.subarray(2000, fs)) / rms(y.subarray(fs + 2000));
    expect(after).toBeLessThan(before / 2);
  });
  it("leaves a signal below the threshold alone", () => {
    const q = Float32Array.from(tone(300, 0.5), (v) => v * 0.02);
    expect(rms(compress(q, fs, -20, 4))).toBeCloseTo(rms(q), 3);
  });
});

describe("helpers", () => {
  it("normalizePeak scales to peak", () => {
    const y = normalizePeak(new Float32Array([0.1, -0.5, 0.2]), 1);
    expect(y[1]).toBeCloseTo(-1);
  });
  it("trimSilence strips leading/trailing zeros", () => {
    const y = trimSilence(new Float32Array([0, 0, 0.5, -0.5, 0, 0]));
    expect(y.length).toBe(2);
  });
});
