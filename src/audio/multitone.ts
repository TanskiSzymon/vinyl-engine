// The calibration multitone: eight tones at once, spaced logarithmically across the disc's band,
// with Schroeder phases, which keep the crest factor low so the groove is never overdriven at any
// instant. Each block lasts about 1.2 s and repeats all the way to the label, so a single recording
// gives a frequency response SEPARATELY for every radius: the rim sounds different from the centre,
// because the linear speed halves along the way.

export const MULTITONE_FREQS = [100, 150, 220, 320, 470, 680, 1000, 1400];

export function multitone(seconds: number, fs: number, freqs = MULTITONE_FREQS, amp = 0.9): Float32Array {
  const n = Math.round(seconds * fs);
  const out = new Float32Array(n);
  const N = freqs.length;
  for (let k = 0; k < N; k += 1) {
    const phase = (-Math.PI * k * (k - 1)) / N; // fazy Schroedera
    const w = (2 * Math.PI * freqs[k]) / fs;
    for (let i = 0; i < n; i += 1) out[i] += Math.sin(w * i + phase);
  }
  let peak = 0;
  for (let i = 0; i < n; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0 ? amp / peak : 0;
  for (let i = 0; i < n; i += 1) out[i] *= g;
  return out;
}
