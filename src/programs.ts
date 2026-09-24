// Programy plyt testowych. Segmenty w sekundach od poczatku muzyki (po lead-in).
import { clicks, concat, silence, sweep, tone } from "./audio/synth";
import { renderMelody, tuneById } from "./audio/melody";
import { multitone } from "./audio/multitone";
import { musicStartR, pitchMm } from "./record/layout";
import type { Ring } from "./gcode/rings";
import type { RecordParams } from "./record/layout";

export type Segment = { name: string; freq: number | null; start: number; end: number; radiusMm?: number };

function build(fs: number, parts: { name: string; freq: number | null; sig: Float32Array }[]) {
  const segments: Segment[] = [];
  let t = 0;
  for (const p of parts) { const d = p.sig.length / fs; segments.push({ name: p.name, freq: p.freq, start: t, end: t + d }); t += d; }
  return { signal: concat(...parts.map((p) => p.sig)), segments };
}

/**
 * The matrix disc (Ghassaei's method): closed rings, each with a different combination of
 * parameters and a DIFFERENT frequency (a whole number of cycles per revolution), so a recording
 * identifies each ring by its pitch. Groups are separated by a groupGapMm band.
 */
export type RingDef = { gap: number; amp: number; layers: number; step?: number; cycles: number; note: string; group: number };

/**
 * Szybka macierz: 6 pierscieni na malej plycie (170 mm, ~1 h druku). Odpowiada na jedno
 * pytanie - czy igla w ogole trzyma cusp i slyszy modulacje boczna - zanim poswiecimy 3 h.
 */
export const QUICK_RING_DEFS: RingDef[] = [
  { gap: 0.2, amp: 0, layers: 4, cycles: 0, note: "silence, background noise", group: 0 },
  { gap: 0.2, amp: 0.15, layers: 4, cycles: 769, note: "reference, about 1 kHz: floor 0.2, 4 layers, step 0.1", group: 0 },
  { gap: 0.2, amp: 0.15, layers: 4, cycles: 385, note: "500 Hz", group: 0 },
  { gap: 0.3, amp: 0.15, layers: 4, cycles: 846, note: "szersze dno 0.3", group: 1 },
  { gap: 0.2, amp: 0.15, layers: 4, step: 0.16, cycles: 692, note: "szerszy krok 0.16 (plytsze V)", group: 1 },
  { gap: 0.2, amp: 0.15, layers: 3, cycles: 1000, note: "3 layers, a 0.6 mm trench", group: 2 },
];

export const FULL_RING_DEFS: RingDef[] = [
    // group 0: background noise and the reference point
    { gap: 0.1, amp: 0, layers: 3, cycles: 0, note: "silence, background noise", group: 0 },
    { gap: 0.1, amp: 0.15, layers: 3, cycles: 769, note: "reference, about 1 kHz", group: 0 },
    // group 1: floor width against amplitude at about 1 kHz (different cycle counts give
    // different tones, 850-1150 Hz)
    { gap: 0.1, amp: 0.08, layers: 3, cycles: 654, note: "floor 0.1, A 0.08", group: 1 },
    { gap: 0.1, amp: 0.25, layers: 3, cycles: 692, note: "floor 0.1, A 0.25", group: 1 },
    { gap: 0.2, amp: 0.15, layers: 3, cycles: 731, note: "floor 0.2, A 0.15", group: 1 },
    { gap: 0.3, amp: 0.15, layers: 3, cycles: 808, note: "floor 0.3, A 0.15", group: 1 },
    { gap: 0.1, amp: 0.15, layers: 3, step: 0.18, cycles: 846, note: "step 0.18, a shallower V", group: 1 },
    { gap: 0.1, amp: 0.15, layers: 3, step: 0.06, cycles: 885, note: "step 0.06, a steeper V", group: 1 },
    // group 2: trench depth
    { gap: 0.1, amp: 0.15, layers: 2, cycles: 769, note: "2 layers, 0.4 mm", group: 2 },
    { gap: 0.1, amp: 0.15, layers: 4, cycles: 846, note: "4 layers, 0.8 mm", group: 2 },
    // group 3: bandwidth at the default geometry
    { gap: 0.1, amp: 0.15, layers: 3, cycles: 192, note: "250 Hz", group: 3 },
    { gap: 0.1, amp: 0.15, layers: 3, cycles: 385, note: "500 Hz", group: 3 },
    { gap: 0.1, amp: 0.15, layers: 3, cycles: 1154, note: "1500 Hz", group: 3 },
    { gap: 0.1, amp: 0.15, layers: 3, cycles: 1538, note: "2000 Hz", group: 3 },
    { gap: 0.1, amp: 0.05, layers: 3, cycles: 1538, note: "2000 Hz A0.05 (limit krzywizny)", group: 3 },
];

export function matrixRings(p: RecordParams, defs: RingDef[] = FULL_RING_DEFS): Ring[] {
  const rps = p.rpm / 60;
  const groupGapMm = 2.5;
  const rings: Ring[] = [];
  let edge = p.outerGrooveR; // zewnetrzna krawedz nastepnego pierscienia (z amplituda)
  let prevGroup = 0;
  for (const d of defs) {
    if (d.group !== prevGroup) { edge -= groupGapMm; prevGroup = d.group; }
    const step = d.step ?? p.wallStepMm;
    const half = (p.beadWidthMm + d.gap) / 2 + (d.layers - 1) * step; // polowa rozstawu scianek w najwyzszej warstwie
    const outerExtent = half + p.beadWidthMm / 2 + d.amp;
    const radiusMm = edge - outerExtent;
    rings.push({ radiusMm, grooveGapMm: d.gap, amplitudeMm: d.amp, wallLayers: d.layers, wallStepMm: step, cyclesPerRev: d.cycles, freqHz: d.cycles * rps, note: d.note });
    edge = radiusMm - outerExtent - 0.5; // at least 0.5 mm of land on top
  }
  if (edge < p.innerGrooveR) throw new Error(`the matrix does not fit: the last edge ${edge.toFixed(1)} < innerGrooveR ${p.innerGrooveR}`);
  return rings;
}

/**
 * Scales segment durations to the disc's budget (capacity depends on diameter and speed) so the
 * last segment is not truncated when it is cut. `weights` are relative lengths.
 */
function fit(budgetSec: number, weights: number[], minSec = 1): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const usable = Math.max(minSec * weights.length, budgetSec * 0.98);
  return weights.map((w) => Math.max(minSec, (usable * w) / sum));
}

/** A melody on the spiral: 0.5 s of silence for the run-in, then the tune until the disc is full. */
export function melodyProgram(fs: number, budgetSec: number, tuneId = "korobeiniki") {
  const music = Math.max(1, budgetSec * 0.98 - 0.5);
  const tune = tuneById(tuneId);
  return build(fs, [
    { name: "silence", freq: null, sig: silence(0.5, fs) },
    { name: tune.id, freq: null, sig: renderMelody(fs, music, tune.notes, { bpm: tune.bpm }) },
  ]);
}

/** The smoke test disc (200 mm): does it print, does the stylus track silence, and does the
 *  direction come out right (a rising sweep). */
export function smokeProgram(fs: number, budgetSec: number) {
  const [a, b, c] = fit(budgetSec, [1, 1, 1]);
  return build(fs, [
    { name: "silence", freq: null, sig: silence(a, fs) },
    { name: "1k", freq: 1000, sig: tone(1000, b, fs) },
    { name: "sweep200-1500", freq: null, sig: sweep(200, 1500, c, fs) },
  ]);
}

/** Promien, na ktorym laduje chwila t [s] od poczatku muzyki (stala predkosc katowa). */
export function radiusAtSec(p: RecordParams, t: number): number {
  return musicStartR(p) - (pitchMm(p) * t * p.rpm) / 60;
}

/** Annotates each segment with the radius of its midpoint, for radius dependent calibration. */
export function withRadii(segments: Segment[], p: RecordParams): Segment[] {
  return segments.map((s) => ({ ...s, radiusMm: Math.round(radiusAtSec(p, (s.start + s.end) / 2) * 10) / 10 }));
}

/**
 * Calibration: 1 s of silence, then blocks of [1.2 s multitone, 0.3 s gap] to the end of the
 * disc. Each block lands at a different radius, so the response is measured along the whole disc.
 */
export function calibrationProgram(fs: number, budgetSec: number) {
  const parts: { name: string; freq: number | null; sig: Float32Array }[] = [{ name: "silence", freq: null, sig: silence(1, fs) }];
  let t = 1;
  for (let i = 0; t + 1.5 <= budgetSec * 0.98; i += 1) {
    parts.push({ name: `mt${i}`, freq: null, sig: multitone(1.2, fs) });
    parts.push({ name: `gap${i}`, freq: null, sig: silence(0.3, fs) });
    t += 1.5;
  }
  return build(fs, parts);
}

/** Stara kalibracja tonami po kolei - zostaje do recznego ogladania w Audacity. */
export function calibProgram(fs: number, budgetSec: number) {
  const [s1, t1, t2, t3, t4, sw, ck, s2] = fit(budgetSec, [3, 3, 3, 3, 3, 8, 3, 2]);
  return build(fs, [
    { name: "silence", freq: null, sig: silence(s1, fs) },
    { name: "1000", freq: 1000, sig: tone(1000, t1, fs) },
    { name: "500", freq: 500, sig: tone(500, t2, fs) },
    { name: "250", freq: 250, sig: tone(250, t3, fs) },
    { name: "125", freq: 125, sig: tone(125, t4, fs) },
    { name: "sweep100-2000", freq: null, sig: sweep(100, 2000, sw, fs) },
    { name: "clicks", freq: null, sig: clicks(1, ck, fs) },
    { name: "silence-end", freq: null, sig: silence(s2, fs) },
  ]);
}
