// Analiza nagrania z gramofonu (USB LP120X -> Audacity -> WAV). Dla segmentow tonowych
// the amplitude of that component (Goertzel); for silence, RMS is the noise, and SNR is the tone
// level minus the noise in the silence.
// offsetSec is the time in the recording where segment 0 begins (read it off in Audacity).
import { rms } from "../audio/dsp";
import type { Segment } from "../programs";

export type Row = { name: string; freq: number | null; levelDb: number; snrDb: number | null };

/** Amplituda RMS skladowej f [Hz] w sygnale x. */
export function goertzel(x: Float32Array, fs: number, f: number): number {
  const w = (2 * Math.PI * f) / fs, c = 2 * Math.cos(w);
  let s0 = 0, s1 = 0, s2 = 0;
  for (let i = 0; i < x.length; i += 1) { s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; }
  const power = s1 * s1 + s2 * s2 - c * s1 * s2;
  // |X_k| = sqrt(power); the peak amplitude is 2|X_k|/N, so the RMS is sqrt(2)*|X_k|/N
  return (Math.SQRT2 * Math.sqrt(power)) / x.length;
}

const dB = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));

export function analyzeSegments(rec: Float32Array, fs: number, segments: Segment[], offsetSec: number): Row[] {
  const margin = 0.3;
  const slice = (s: Segment) => rec.subarray(Math.round((offsetSec + s.start + margin) * fs), Math.round((offsetSec + s.end - margin) * fs));
  const silenceSeg = segments.find((s) => s.name === "silence");
  const noise = silenceSeg ? rms(slice(silenceSeg)) : null;
  return segments.map((s) => {
    const x = slice(s);
    const level = s.freq ? goertzel(x, fs, s.freq) : rms(x);
    return { name: s.name, freq: s.freq, levelDb: Math.round(dB(level) * 10) / 10, snrDb: noise !== null && s.freq ? Math.round((dB(level) - dB(noise)) * 10) / 10 : null };
  });
}
