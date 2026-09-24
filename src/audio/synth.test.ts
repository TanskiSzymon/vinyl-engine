import { describe, expect, it } from "vitest";
import { rms } from "./dsp";
import { clicks, concat, silence, sweep, tone } from "./synth";

describe("synth", () => {
  it("tone has expected length and rms", () => {
    const t = tone(440, 1, 8000, 0.8);
    expect(t.length).toBe(8000);
    expect(rms(t)).toBeCloseTo(0.8 / Math.SQRT2, 2);
  });
  it("sweep starts slow and ends fast (zero crossings)", () => {
    const s = sweep(200, 1600, 2, 8000);
    const zc = (a: Float32Array) => { let n = 0; for (let i = 1; i < a.length; i += 1) if ((a[i - 1] < 0) !== (a[i] < 0)) n += 1; return n; };
    expect(zc(s.subarray(0, 4000))).toBeLessThan(zc(s.subarray(12000)));
  });
  it("silence + clicks + concat", () => {
    const c = concat(silence(0.5, 8000), clicks(2, 1, 8000));
    expect(c.length).toBe(12000);
    expect(c[100]).toBe(0);
    let max = 0;
    for (let i = 4000; i < c.length; i += 1) max = Math.max(max, c[i]);
    expect(max).toBeGreaterThan(0.5);
  });
});
