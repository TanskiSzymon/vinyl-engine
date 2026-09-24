// The audio path before any geometry: trim -> highpass -> lowpass (4th order Butterworth) ->
// [RIAA pre-emphasis] -> drive plus a soft limiter -> truncation to the disc's capacity ->
// peak normalisation to 1, so the groove offset is o(t) = A*x(t).
import { applyBiquad, applyChain, butterworthLowpass4, compress, highpass, highShelf, normalizePeak, normalizeRobust, trimSilence } from "./dsp";
import { riaaPlayback, riaaPreEmphasis } from "./riaa";
import { maxDurationSec, trackableHz, type RecordParams } from "../record/layout";
import { applyCalibration, processInBlocks, type CalibrationProfile } from "../analysis/calibrate";

/**
 * A radius dependent band ceiling. A bead cannot draw a wave tighter than itself: above
 * trackableHz(r) the material smears across the whole amplitude and fills the groove in. Rather
 * than allow that, those frequencies are cut with a 4th order filter, which is the difference
 * between a clean groove and a filled one. The filter varies with time, because the radius
 * shrinks along the spiral.
 */
export function limitToTrackable(x: Float32Array, p: RecordParams, radiusAtSec: (t: number) => number): Float32Array {
  return processInBlocks(x, p.sampleRate, (seg, mid) => {
    const fc = Math.max(120, Math.min(p.lowpassHz, trackableHz(p, radiusAtSec(mid))));
    // Lift the top BEFORE the cut: the shelf sits below the band ceiling, so it raises what will
    // still get through rather than what is about to be removed anyway.
    const boosted = p.presenceDb > 0 ? applyBiquad(seg, highShelf(fc * 0.45, p.sampleRate, p.presenceDb)) : seg;
    return applyChain(boosted, butterworthLowpass4(fc, p.sampleRate));
  });
}

/** A soft limiter: driveDb of gain through tanh, which raises the average level and rounds peaks. */
export function softClip(x: Float32Array, driveDb: number): Float32Array {
  if (driveDb <= 0) return x;
  const g = Math.pow(10, driveDb / 20);
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i += 1) y[i] = Math.tanh(x[i] * g);
  return y;
}

export type PrepareOpts = {
  /** Test discs open with silence that IS a measurement segment, so it must not be trimmed. */
  trim?: boolean;
  /** Where the passage starts, in seconds (the chorus instead of the intro, say). */
  startSec?: number;
  /** Maximum passage length in seconds; the disc capacity still wins. */
  lengthSec?: number;
  /** A profile from the calibration loop plus a time->radius function: EQ correction before cutting. */
  calibration?: CalibrationProfile;
  radiusAtSec?: (t: number) => number;
};

export function prepareSignal(raw: Float32Array, p: RecordParams, opts: PrepareOpts = {}): Float32Array {
  let x = raw;
  if (opts.startSec && opts.startSec > 0) x = x.subarray(Math.min(x.length, Math.floor(opts.startSec * p.sampleRate)));
  if (opts.lengthSec && opts.lengthSec > 0) x = x.subarray(0, Math.floor(opts.lengthSec * p.sampleRate));
  if (opts.trim !== false) x = trimSilence(x);
  x = applyBiquad(x, highpass(p.highpassHz, p.sampleRate));
  x = applyChain(x, butterworthLowpass4(p.lowpassHz, p.sampleRate));
  if (p.compressionDb > 0) {
    // compressionDb says "how hard": the threshold drops and the ratio rises along with it.
    const threshold = -2.5 * p.compressionDb;
    const ratio = 2 + p.compressionDb / 4;
    x = compress(normalizeRobust(x, 0.999), p.sampleRate, threshold, ratio, 5, 120);
  }
  if (opts.radiusAtSec) x = limitToTrackable(x, p, opts.radiusAtSec);
  if (opts.calibration && opts.radiusAtSec) x = applyCalibration(x, p.sampleRate, opts.calibration, opts.radiusAtSec, p.lowpassHz);
  if (p.riaaPreEmphasis) x = applyBiquad(x, riaaPreEmphasis(p.sampleRate));
  x = softClip(normalizeRobust(x, 0.999), p.driveDb);
  const maxN = Math.floor(maxDurationSec(p) * p.sampleRate);
  if (x.length > maxN) x = x.subarray(0, maxN);
  return normalizeRobust(x, 0.999);
}

/** "How it should sound": the groove content run through the RIAA playback curve. */
export function playbackPreview(signal: Float32Array, p: RecordParams): Float32Array {
  return normalizePeak(applyBiquad(signal, riaaPlayback(p.sampleRate)), 0.9);
}
