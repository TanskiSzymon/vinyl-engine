// RIAA: stale czasowe 3180 / 318 / 75 us. Pre-emfaza = odwrotnosc, z dodatkowym
// pole (the so called Neumann pole) so the filter stays proper, with two zeros and two poles.
import { magnitudeAt, type Biquad } from "./dsp";

const T1 = 3180e-6, T2 = 318e-6, T3 = 75e-6, T4 = 3.18e-6;

/** Transformacja biliniowa sekcji 2. rzedu. B, A = wspolczynniki rosnacych poteg s. */
export function bilinear(B: [number, number, number], A: [number, number, number], fs: number): Biquad {
  const K = 2 * fs, K2 = K * K;
  const [B0, B1, B2] = B, [A0, A1, A2] = A;
  const b0 = B2 * K2 + B1 * K + B0, b1 = 2 * B0 - 2 * B2 * K2, b2 = B2 * K2 - B1 * K + B0;
  const a0 = A2 * K2 + A1 * K + A0, a1 = 2 * A0 - 2 * A2 * K2, a2 = A2 * K2 - A1 * K + A0;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function unityAt1k(c: Biquad, fs: number): Biquad {
  const g = magnitudeAt(c, 1000, fs);
  return { ...c, b0: c.b0 / g, b1: c.b1 / g, b2: c.b2 / g };
}

/** The playback curve, which is what a phono preamp applies. 0 dB at 1 kHz. */
export function riaaPlayback(fs: number): Biquad {
  return unityAt1k(bilinear([1, T2, 0], [1, T1 + T3, T1 * T3], fs), fs);
}

/** Recording pre-emphasis: the inverse of the playback curve. 0 dB at 1 kHz. */
export function riaaPreEmphasis(fs: number): Biquad {
  return unityAt1k(bilinear([1, T1 + T3, T1 * T3], [1, T2 + T4, T2 * T4], fs), fs);
}
