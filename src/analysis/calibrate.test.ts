// A loop test: a "turntable" is simulated with a known filter (rolled off highs, radius dependent
// attenuation, noise, a delay and running 1% fast), then calibrated, and the check is whether the
// correction
// wyprostowala odpowiedz.
import { describe, expect, it } from "vitest";
import { applyBiquad, lowpass } from "../audio/dsp";
import { MULTITONE_FREQS } from "../audio/multitone";
import { concat, silence, tone } from "../audio/synth";
import { calibrationProgram, withRadii } from "../programs";
import { DEFAULT_PARAMS, withOverrides } from "../record/layout";
import { radiusAtSec } from "../programs";
import { alignOffset, applyCalibration, buildProfile, designFir, measureBlocksAuto } from "./calibrate";
import { goertzel } from "./analyze";

const fs = 8000;
const p = withOverrides(DEFAULT_PARAMS, { rpm: 45 });

/** The "turntable": a 500 Hz lowpass, extra loss of highs towards the centre, noise and gain. */
function turntable(x: Float32Array, radiusAt: (t: number) => number): Float32Array {
  const y = applyBiquad(x, lowpass(500, fs));
  const out = new Float32Array(y.length);
  for (let i = 0; i < y.length; i += 1) {
    const r = radiusAt(i / fs);
    const inner = Math.max(0, (100 - r) / 40); // 0 at the rim, about 1 at 60 mm
    out[i] = 0.5 * y[i] * (1 - 0.4 * inner) + 0.004 * (Math.random() - 0.5);
  }
  return out;
}

function speedUp(x: Float32Array, ratio: number): Float32Array {
  const n = Math.floor(x.length / ratio), out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) { const pos = i * ratio, j = Math.floor(pos), f = pos - j; out[i] = j + 1 < x.length ? x[j] * (1 - f) + x[j + 1] * f : 0; }
  return out;
}

describe("petla kalibracji", () => {
  const prog = calibrationProgram(fs, 30);
  const segments = withRadii(prog.segments, p);
  const radiusAt = (t: number) => radiusAtSec(p, t);

  it("alignOffset znajduje poczatek wzorca w nagraniu z wyprzedzeniem", () => {
    const rec = concat(silence(2.37, fs), turntable(prog.signal, radiusAt), silence(1, fs));
    const { offsetSec, score } = alignOffset(rec, prog.signal, fs);
    expect(Math.abs(offsetSec - 2.37)).toBeLessThan(0.03);
    expect(score).toBeGreaterThan(0.5);
  });

  it("measures the high frequency loss, the noise and the speed, and the correction flattens the in band response", () => {
    const rec = concat(silence(1.5, fs), speedUp(turntable(prog.signal, radiusAt), 1.01));
    const { offsetSec } = alignOffset(rec, prog.signal, fs);
    const blocks = measureBlocksAuto(rec, prog.signal, fs, segments, offsetSec, MULTITONE_FREQS);
    expect(blocks.length).toBeGreaterThan(10);
    const cal = buildProfile(blocks, MULTITONE_FREQS, { rpm: 45, diameterMm: 250, lowpassHz: 690, riaa: true });
    expect(cal.speedRatio).toBeCloseTo(1.01, 2);
    // 1000 Hz sits about 7 dB below 470 Hz after a 500 Hz lowpass, so the correction is positive
    const i1000 = MULTITONE_FREQS.indexOf(1000), i470 = MULTITONE_FREQS.indexOf(470);
    expect(cal.measuredDb[0][i1000]).toBeLessThan(-4);
    expect(cal.correctionDb[0][i1000]).toBeGreaterThan(3);
    expect(Math.abs(cal.correctionDb[0][i470])).toBeLessThan(3); // the anchor is the band median, not 470 Hz
    // towards the centre the turntable loses more, so the correction grows
    expect(cal.correctionDb[cal.radii.length - 1][i1000]).toBeGreaterThanOrEqual(cal.correctionDb[0][i1000]);

    // closing the loop: the corrected multitone through the same turntable comes back flat
    const corrected = applyCalibration(prog.signal, fs, cal, radiusAt, 1200);
    const played = turntable(corrected, radiusAt);
    const seg = segments.find((s) => s.name === "mt3")!;
    const win = played.subarray(Math.round((seg.start + 0.15) * fs), Math.round((seg.end - 0.1) * fs));
    const refWin = prog.signal.subarray(Math.round((seg.start + 0.15) * fs), Math.round((seg.end - 0.1) * fs));
    // Inside the band the simulated turntable still passes, the correction flattens the response.
    const levels = [220, 320, 470, 680].map((f) => 20 * Math.log10(goertzel(win, fs, f) / goertzel(refWin, fs, f)));
    const spread = Math.max(...levels) - Math.min(...levels);
    expect(spread).toBeLessThan(2.5); // without the correction 470 against 680 Hz differ by about 5 dB
    // 1000 Hz sits 12 dB down and the boost is capped at 9, so some loss remains, as intended
    const at1k = 20 * Math.log10(goertzel(win, fs, 1000) / goertzel(refWin, fs, 1000));
    expect(at1k).toBeGreaterThan(-11); // before the correction it was -19
    expect(at1k).toBeLessThan(0);
  });

  it("designFir: 0 dB wszedzie daje impuls jednostkowy", () => {
    const h = designFir(MULTITONE_FREQS, MULTITONE_FREQS.map(() => 0), fs, 65, 1200);
    const y = applyFir(tone(300, 0.5, fs, 0.5), h);
    expect(goertzel(y.subarray(100), fs, 300)).toBeCloseTo(0.5 / Math.SQRT2, 1);
  });
});

function applyFir(x: Float32Array, h: Float32Array): Float32Array {
  const half = (h.length - 1) >> 1, y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i += 1) { let s = 0; for (let k = 0; k < h.length; k += 1) { const j = i + half - k; if (j >= 0 && j < x.length) s += h[k] * x[j]; } y[i] = s; }
  return y;
}
