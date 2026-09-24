// Resampling liniowy z antyaliasingiem (nagranie z gramofonu przychodzi w 44.1/48 kHz,
// silnik pracuje w 8 kHz). Dwie sekcje Butterwortha przed decymacja wystarczaja - i tak
// interesuje nas pasmo do ~1.5 kHz.
import { applyChain, butterworthLowpass4 } from "./dsp";

export function resample(x: Float32Array, fsIn: number, fsOut: number): Float32Array {
  if (fsIn === fsOut) return x;
  const y = fsOut < fsIn ? applyChain(x, butterworthLowpass4(0.45 * fsOut, fsIn)) : x;
  const n = Math.floor((x.length * fsOut) / fsIn);
  const out = new Float32Array(n);
  const ratio = fsIn / fsOut;
  for (let i = 0; i < n; i += 1) {
    const pos = i * ratio, j = Math.floor(pos), f = pos - j;
    out[i] = j + 1 < y.length ? y[j] * (1 - f) + y[j + 1] * f : y[Math.min(j, y.length - 1)];
  }
  return out;
}
