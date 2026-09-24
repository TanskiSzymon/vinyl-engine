// Test signals for the tuning discs. Pure maths.

export function tone(freqHz: number, seconds: number, fs: number, amp = 0.8): Float32Array {
  const n = Math.round(seconds * fs);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = amp * Math.sin((2 * Math.PI * freqHz * i) / fs);
  return out;
}

/** A logarithmic sweep f0->f1, with equal time per octave. */
export function sweep(f0: number, f1: number, seconds: number, fs: number, amp = 0.8): Float32Array {
  const n = Math.round(seconds * fs);
  const out = new Float32Array(n);
  const k = Math.log(f1 / f0);
  for (let i = 0; i < n; i += 1) {
    const t = i / fs;
    const phase = ((2 * Math.PI * f0 * seconds) / k) * (Math.exp((t * k) / seconds) - 1);
    out[i] = amp * Math.sin(phase);
  }
  return out;
}

export function silence(seconds: number, fs: number): Float32Array {
  return new Float32Array(Math.round(seconds * fs));
}

/** Impulsy 1 ms co 1/rateHz s (test odpowiedzi impulsowej i przesluchu miedzy obrotami). */
export function clicks(rateHz: number, seconds: number, fs: number, amp = 0.9): Float32Array {
  const out = new Float32Array(Math.round(seconds * fs));
  const period = Math.round(fs / rateHz), width = Math.max(1, Math.round(fs / 1000));
  for (let i = 0; i < out.length; i += period) for (let j = 0; j < width && i + j < out.length; j += 1) out[i + j] = amp;
  return out;
}

export function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}
