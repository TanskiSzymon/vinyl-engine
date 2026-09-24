// The calibration loop: a disc of multitone blocks -> a recording from the turntable -> a
// measurement of how much of each tone survived (separately per radius) -> a radius dependent
// EQ correction profile -> applied to later tracks BEFORE they are written into the groove.
// It only corrects linear effects (bandwidth, the loss of highs towards the centre, RIAA).
// Print noise and non-linear distortion (a wall smeared by high curvature) cannot be undone
// with EQ, they can only be avoided.
import { rms } from "../audio/dsp";
import type { Segment } from "../programs";
import { goertzel } from "./analyze";

export type CalibrationProfile = {
  version: 1;
  sampleRate: number;
  freqs: number[];
  radii: number[];          // radii in mm the correction is given for, from the rim inward
  correctionDb: number[][]; // [radius][freq] correction to apply BEFORE cutting
  measuredDb: number[][];   // [radius][freq] measured response relative to the anchor level
  noiseDb: number[];        // [freq] noise level relative to the anchor, taken from the gaps
  speedRatio: number;       // measured / nominal speed (1.01 = the turntable runs 1% fast)
  refFreq: number;
  madeAt: string;
  source: { rpm: number; diameterMm: number; lowpassHz: number; riaa: boolean };
};

const dB = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));

/** RMS envelope in `hopSec` windows, used to align the recording with the reference. */
function envelope(x: Float32Array, fs: number, hopSec = 0.01): Float32Array {
  const hop = Math.max(1, Math.round(hopSec * fs));
  const n = Math.floor(x.length / hop);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = rms(x.subarray(i * hop, (i + 1) * hop));
  return out;
}

function normalize(e: Float32Array): Float32Array {
  const mean = e.reduce((a, b) => a + b, 0) / e.length;
  let v = 0; for (let i = 0; i < e.length; i += 1) v += (e[i] - mean) ** 2;
  const sd = Math.sqrt(v / e.length) || 1;
  return Float32Array.from(e, (a) => (a - mean) / sd);
}

/**
 * Finds the second of the recording where the pattern (segment 0) starts, by correlating
 * envelopes: the "1.2 s of tone / 0.3 s of silence" pattern is distinctive enough that the
 * needle drop click and the run-in do not confuse it. Returns the offset in seconds and the
 * quality of the match (0..1).
 */
export function alignOffset(rec: Float32Array, ref: Float32Array, fs: number): { offsetSec: number; score: number } {
  const hop = 0.01;
  const a = normalize(envelope(rec, fs, hop)), b = normalize(envelope(ref, fs, hop));
  let best = -Infinity, bestLag = 0;
  const maxLag = a.length - b.length;
  if (maxLag < 0) return { offsetSec: 0, score: 0 };
  for (let lag = 0; lag <= maxLag; lag += 1) {
    let s = 0;
    for (let i = 0; i < b.length; i += 1) s += a[lag + i] * b[i];
    if (s > best) { best = s; bestLag = lag; }
  }
  return { offsetSec: bestLag * hop, score: Math.max(0, Math.min(1, best / b.length)) };
}

/** Highest amplitude within +-scanPct of f, since a turntable rarely runs exactly at nominal. */
function peakNear(x: Float32Array, fs: number, f: number, scanPct = 3): { amp: number; ratio: number } {
  let best = 0, bestRatio = 1;
  for (let k = -scanPct * 10; k <= scanPct * 10; k += 1) {
    const ratio = 1 + k / 1000;
    const a = goertzel(x, fs, f * ratio);
    if (a > best) { best = a; bestRatio = ratio; }
  }
  return { amp: best, ratio: bestRatio };
}

export type BlockMeasurement = { radiusMm: number; levelDb: number[]; noiseDb: number[]; speedRatio: number };

/**
 * For each multitone block: the level of every tone in the recording relative to the same tone
 * in the reference signal (that is, relative to what SHOULD have been heard), plus the noise
 * measured in the adjacent gap.
 */
export function measureBlocks(rec: Float32Array, ref: Float32Array, fs: number, segments: Segment[], offsetSec: number, freqs: number[], speedRatio = 1): BlockMeasurement[] {
  const out: BlockMeasurement[] = [];
  const slice = (x: Float32Array, t0: number, t1: number) => x.subarray(Math.max(0, Math.round(t0 * fs)), Math.min(x.length, Math.round(t1 * fs)));
  // A turntable running 1% fast shifts the 20th block by 0.3 s, enough for the measurement
  // window to land in a gap. Time in the recording = offset + reference time / speedRatio.
  const at = (t: number) => offsetSec + t / speedRatio;
  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i];
    if (!s.name.startsWith("mt")) continue;
    const gap = segments[i + 1];
    const rSeg = slice(rec, at(s.start + 0.15), at(s.end - 0.1));
    const fSeg = slice(ref, s.start + 0.15, s.end - 0.1);
    if (rSeg.length < fs * 0.3) continue;
    const ratios: number[] = [];
    const levelDb = freqs.map((f) => {
      const pk = peakNear(rSeg, fs, f);
      ratios.push(pk.ratio);
      return dB(pk.amp) - dB(goertzel(fSeg, fs, f));
    });
    const noise = gap && gap.name.startsWith("gap") ? slice(rec, at(gap.start + 0.05), at(gap.end - 0.05)) : null;
    const noiseDb = freqs.map((f) => (noise && noise.length > fs * 0.1 ? dB(goertzel(noise, fs, f)) - dB(goertzel(fSeg, fs, f)) : -60));
    ratios.sort((a, b) => a - b);
    out.push({ radiusMm: s.radiusMm ?? 0, levelDb, noiseDb, speedRatio: ratios[Math.floor(ratios.length / 2)] });
  }
  return out;
}

/** Two passes: the first estimates turntable speed from the early blocks, the second measures
 *  with the corrected timebase. */
export function measureBlocksAuto(rec: Float32Array, ref: Float32Array, fs: number, segments: Segment[], offsetSec: number, freqs: number[]): BlockMeasurement[] {
  const first = measureBlocks(rec, ref, fs, segments.slice(0, 12), offsetSec, freqs, 1);
  const speeds = first.map((b) => b.speedRatio).sort((a, b) => a - b);
  const speed = speeds.length ? speeds[Math.floor(speeds.length / 2)] : 1;
  return measureBlocks(rec, ref, fs, segments, offsetSec, freqs, speed);
}

export type BuildOpts = {
  maxBoostDb?: number; maxCutDb?: number; minSnrDb?: number; radiusStepMm?: number;
  /** Band ceiling at a given radius. Above it the correction is always 0. */
  maxUsableHz?: (radiusMm: number) => number;
};

/**
 * Builds the profile from the block measurements: for each tone it fits a straight line
 * level(radius), subtracts the anchor level (the correction is relative, so preamp gain does not
 * matter), flips the sign and clamps. Where a tone is lost in the noise the correction is 0,
 * because boosting noise gains nothing.
 */
function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

/**
 * Builds the correction profile. The decisions that matter:
 * - the anchor is the MEDIAN of the levels inside the usable band at that radius, not one chosen
 *   frequency; otherwise a reference tone sitting at the edge of the band skews everything,
 * - frequencies above the physical ceiling (maxUsableHz) get 0, because boosting something the
 *   bead cannot draw only raises the noise,
 * - the same for tones lost in the noise (SNR < minSnrDb).
 */
export function buildProfile(blocks: BlockMeasurement[], freqs: number[], source: CalibrationProfile["source"], o: BuildOpts = {}): CalibrationProfile {
  const maxBoost = o.maxBoostDb ?? 9, maxCut = o.maxCutDb ?? 12, minSnr = o.minSnrDb ?? 6;
  if (blocks.length === 0) throw new Error("No multitone blocks found in the recording");
  const usableAt = o.maxUsableHz ?? (() => Infinity);
  const refIdx = Math.floor(freqs.length / 2);
  const rs = blocks.map((b) => b.radiusMm);
  const rMin = Math.min(...rs), rMax = Math.max(...rs);
  const step = o.radiusStepMm ?? 5;
  const radii: number[] = [];
  for (let r = rMax; r >= rMin - 1e-9; r -= step) radii.push(Math.round(r * 10) / 10);
  if (radii.length === 0 || radii[radii.length - 1] > rMin) radii.push(Math.round(rMin * 10) / 10);
  // Each tone level is referred to the median of the usable band in the same block.
  const anchor = new Map<number, number>();
  for (const b of blocks) {
    const usable = freqs.map((f, i) => ({ f, v: b.levelDb[i] })).filter((x) => x.f <= usableAt(b.radiusMm));
    anchor.set(b.radiusMm, median((usable.length ? usable : freqs.map((_, i) => ({ f: 0, v: b.levelDb[i] }))).map((x) => x.v)));
  }
  // linear regression of level(radius) per tone
  const fit = freqs.map((_, fi) => {
    const pts = blocks.map((b) => ({ r: b.radiusMm, y: b.levelDb[fi] - (anchor.get(b.radiusMm) ?? 0) }));
    const n = pts.length, sx = pts.reduce((a, p) => a + p.r, 0), sy = pts.reduce((a, p) => a + p.y, 0);
    const sxx = pts.reduce((a, p) => a + p.r * p.r, 0), sxy = pts.reduce((a, p) => a + p.r * p.y, 0);
    const den = n * sxx - sx * sx;
    const slope = Math.abs(den) < 1e-9 ? 0 : (n * sxy - sx * sy) / den;
    const icpt = (sy - slope * sx) / n;
    return { slope, icpt };
  });
  const noiseDb = freqs.map((_, fi) => median(blocks.map((b) => b.noiseDb[fi] - (anchor.get(b.radiusMm) ?? 0))));
  const measuredDb = radii.map((r) => fit.map((f) => f.icpt + f.slope * r));
  const correctionDb = measuredDb.map((row, ri) => row.map((m, fi) => {
    if (freqs[fi] > usableAt(radii[ri])) return 0;      // above the physical band ceiling
    if (m - noiseDb[fi] < minSnr) return 0;              // the tone is lost in the noise
    return Math.max(-maxCut, Math.min(maxBoost, -m));
  }));
  const speeds = blocks.map((b) => b.speedRatio).sort((a, b) => a - b);
  return {
    version: 1, sampleRate: 8000, freqs, radii, correctionDb, measuredDb, noiseDb,
    speedRatio: speeds[Math.floor(speeds.length / 2)], refFreq: freqs[refIdx], madeAt: new Date().toISOString(), source,
  };
}

/**
 * A linear phase FIR by frequency sampling: the requested response in dB at the points `freqs`,
 * interpolated linearly in log(f), held constant outside the end points, and faded to 0 dB above
 * `lowpassHz`. A Hann window smooths the response.
 */
export function designFir(freqs: number[], gainsDb: number[], fs: number, taps = 257, lowpassHz = 1200): Float32Array {
  const N = taps, half = (N - 1) / 2;
  const bins = Math.floor(N / 2) + 1;
  const mag = new Float64Array(bins);
  const lf = freqs.map(Math.log);
  for (let k = 0; k < bins; k += 1) {
    const f = (k * fs) / N;
    let g: number;
    if (f <= freqs[0]) g = gainsDb[0];
    else if (f >= freqs[freqs.length - 1]) g = gainsDb[gainsDb.length - 1];
    else {
      let i = 0; while (lf[i + 1] < Math.log(f)) i += 1;
      const t = (Math.log(f) - lf[i]) / (lf[i + 1] - lf[i]);
      g = gainsDb[i] * (1 - t) + gainsDb[i + 1] * t;
    }
    if (f > lowpassHz) g *= Math.max(0, 1 - (f - lowpassHz) / (0.5 * lowpassHz)); // fade the correction out of band
    mag[k] = Math.pow(10, g / 20);
  }
  const h = new Float32Array(N);
  for (let n = 0; n < N; n += 1) {
    let acc = mag[0];
    for (let k = 1; k < bins; k += 1) {
      const w = (2 * Math.PI * k) / N;
      acc += (k === bins - 1 && N % 2 === 0 ? 1 : 2) * mag[k] * Math.cos(w * (n - half));
    }
    const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (N - 1));
    h[n] = (acc / N) * win;
  }
  return h;
}

/** Processes the signal in 0.5 s blocks, 50% overlap, Hann window, so the filter may vary
 *  with time. */
export function processInBlocks(x: Float32Array, fs: number, filter: (block: Float32Array, midSec: number) => Float32Array): Float32Array {
  const block = Math.round(0.5 * fs), hop = block / 2;
  const out = new Float32Array(x.length), wsum = new Float32Array(x.length);
  const win = new Float32Array(block);
  for (let i = 0; i < block; i += 1) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (block - 1));
  for (let start = 0; start < x.length; start += hop) {
    const end = Math.min(x.length, start + block);
    const seg = x.subarray(start, end);
    const y = filter(seg, (start + end) / 2 / fs);
    for (let i = 0; i < seg.length; i += 1) { out[start + i] += y[i] * win[i]; wsum[start + i] += win[i]; }
  }
  for (let i = 0; i < out.length; i += 1) if (wsum[i] > 1e-6) out[i] /= wsum[i];
  return out;
}

function convolveSame(x: Float32Array, h: Float32Array): Float32Array {
  const half = (h.length - 1) >> 1;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i += 1) {
    let s = 0;
    const kMin = Math.max(0, i + half - x.length + 1), kMax = Math.min(h.length - 1, i + half);
    for (let k = kMin; k <= kMax; k += 1) s += h[k] * x[i + half - k];
    y[i] = s;
  }
  return y;
}

/**
 * Applies the profile to a signal: in 0.5 s blocks (50% overlap, Hann window), each block through
 * the FIR for the radius where that stretch of time will land on the disc.
 */
export function applyCalibration(x: Float32Array, fs: number, cal: CalibrationProfile, radiusAtSec: (t: number) => number, lowpassHz: number): Float32Array {
  const firs = cal.correctionDb.map((row) => designFir(cal.freqs, row, fs, 257, lowpassHz));
  return processInBlocks(x, fs, (seg, mid) => {
    const r = radiusAtSec(mid);
    let bi = 0, bestD = Infinity;
    cal.radii.forEach((rr, i) => { const d = Math.abs(rr - r); if (d < bestD) { bestD = d; bi = i; } });
    return convolveSame(seg, firs[bi]);
  });
}
