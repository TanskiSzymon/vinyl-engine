// DSP: pure maths, no DOM and no Node APIs. The biquads follow RBJ's "Audio EQ Cookbook".

export type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

export function lowpass(fc: number, fs: number, q = Math.SQRT1_2): Biquad {
  const w0 = (2 * Math.PI * fc) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return { b0: (1 - cos) / 2 / a0, b1: (1 - cos) / a0, b2: (1 - cos) / 2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

export function highpass(fc: number, fs: number, q = Math.SQRT1_2): Biquad {
  const w0 = (2 * Math.PI * fc) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return { b0: (1 + cos) / 2 / a0, b1: -(1 + cos) / a0, b2: (1 + cos) / 2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

/** Polka gorna (high shelf) wg RBJ: podbija wszystko powyzej fc o gainDb. */
export function highShelf(fc: number, fs: number, gainDb: number, q = 0.7): Biquad {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * fc) / fs;
  const cos = Math.cos(w0), sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  const tsa = 2 * Math.sqrt(A) * alpha;
  const a0 = (A + 1) - (A - 1) * cos + tsa;
  return {
    b0: (A * ((A + 1) + (A - 1) * cos + tsa)) / a0,
    b1: (-2 * A * ((A - 1) + (A + 1) * cos)) / a0,
    b2: (A * ((A + 1) + (A - 1) * cos - tsa)) / a0,
    a1: (2 * ((A - 1) - (A + 1) * cos)) / a0,
    a2: ((A + 1) - (A - 1) * cos - tsa) / a0,
  };
}

/**
 * A compressor: it lifts quiet passages relative to loud ones, so the average level rises and the
 * disc's constant surface noise stops masking the music. A simple feed-forward design with a peak
 * envelope.
 */
export function compress(x: Float32Array, fs: number, thresholdDb = -20, ratio = 4, attackMs = 5, releaseMs = 120): Float32Array {
  const atk = Math.exp(-1 / ((attackMs / 1000) * fs));
  const rel = Math.exp(-1 / ((releaseMs / 1000) * fs));
  const thr = Math.pow(10, thresholdDb / 20);
  const y = new Float32Array(x.length);
  let env = 0;
  for (let i = 0; i < x.length; i += 1) {
    const a = Math.abs(x[i]);
    env = a > env ? atk * env + (1 - atk) * a : rel * env + (1 - rel) * a;
    let g = 1;
    if (env > thr && env > 1e-9) {
      const over = env / thr;
      g = Math.pow(over, 1 / ratio - 1);   // powyzej progu tlumimy z zadanym stopniem
    }
    y[i] = x[i] * g;
  }
  return y;
}

/** Butterworth 4. rzedu = dwie sekcje 2. rzedu o Q = 0.5412 i 1.3066. */
export function butterworthLowpass4(fc: number, fs: number): Biquad[] {
  return [lowpass(fc, fs, 0.5412), lowpass(fc, fs, 1.3066)];
}

export function applyBiquad(x: Float32Array, c: Biquad): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i += 1) {
    const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

export function applyChain(x: Float32Array, chain: Biquad[]): Float32Array {
  return chain.reduce((acc, c) => applyBiquad(acc, c), x);
}

/** |H(e^{jw})| at f in Hz, evaluated directly in complex arithmetic. */
export function magnitudeAt(c: Biquad, f: number, fs: number): number {
  const w = (2 * Math.PI * f) / fs;
  const c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = c.b0 + c.b1 * c1 + c.b2 * c2, ni = -(c.b1 * s1 + c.b2 * s2);
  const dr = 1 + c.a1 * c1 + c.a2 * c2, di = -(c.a1 * s1 + c.a2 * s2);
  return Math.hypot(nr, ni) / Math.hypot(dr, di);
}

export function rms(x: Float32Array): number {
  if (x.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < x.length; i += 1) s += x[i] * x[i];
  return Math.sqrt(s / x.length);
}

export function normalizePeak(x: Float32Array, peak = 1): Float32Array {
  let max = 0;
  for (let i = 0; i < x.length; i += 1) max = Math.max(max, Math.abs(x[i]));
  if (max === 0) return new Float32Array(x);
  const g = peak / max;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i += 1) y[i] = x[i] * g;
  return y;
}

/**
 * Normalisation that survives transients: it scales the signal so that a chosen percentile of |x|
 * lands on
 * `target`, i przycina reszte do [-1, 1]. Zwykla normalizacja do szczytu oddaje polowe
 * of the groove amplitude to a single filter overshoot at the start of a track. Here, at the cost
 * of rare and brief clipping, the whole signal sits a few dB louder relative to the print noise.
 */
export function normalizeRobust(x: Float32Array, percentile = 0.999, target = 1): Float32Array {
  if (x.length === 0) return new Float32Array(0);
  const abs = Float64Array.from(x, Math.abs).sort();
  const ref = abs[Math.min(abs.length - 1, Math.floor(percentile * abs.length))] || abs[abs.length - 1];
  if (ref === 0) return new Float32Array(x);
  const g = target / ref;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i += 1) y[i] = Math.max(-1, Math.min(1, x[i] * g));
  return y;
}

/** Przycina cisze z poczatku i konca (prog wzgledem szczytu). Z lib/soundwave.ts. */
export function trimSilence(samples: Float32Array, thresholdRatio = 0.02): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak === 0) return samples;
  const threshold = peak * thresholdRatio;
  let start = 0, end = samples.length - 1;
  while (start < end && Math.abs(samples[start]) < threshold) start += 1;
  while (end > start && Math.abs(samples[end]) < threshold) end -= 1;
  return samples.subarray(start, end + 1);
}
