// Groove geometry parameterised by the angle Theta, in radians. Theta grows counter-clockwise: in
// the disc's own frame the disc turns clockwise, so the stylus travels the other way. Time follows
// from the angle, t = Theta_music / omega at constant angular speed, so no arc length integral is
// needed.
import { musicStartR, musicTurns, pitchMm, type RecordParams } from "./layout";

const TWO_PI = 2 * Math.PI;

export type Pt = { x: number; y: number };
export type PathPoint = Pt & { w: number };
export type RadialFn = (theta: number) => number;

/** Linear interpolation of the signal at time t in seconds; 0 outside its range. */
export function sampleAt(signal: Float32Array, sampleRate: number, t: number): number {
  const pos = t * sampleRate;
  if (!(pos >= 0) || pos >= signal.length - 1) return 0;
  const i = Math.floor(pos), f = pos - i;
  return signal[i] * (1 - f) + signal[i + 1] * f;
}

export type PolarOpts = {
  cx: number; cy: number; thetaStart: number; thetaEnd: number; spacingMm: number;
  radius: RadialFn; width: number | ((theta: number) => number);
};

/** Points along r(Theta) for Theta in [start, end], spaced about spacingMm apart along the arc. */
export function polarPath(o: PolarOpts): PathPoint[] {
  const out: PathPoint[] = [];
  let theta = o.thetaStart;
  for (;;) {
    const r = o.radius(theta);
    out.push({ x: o.cx + r * Math.cos(theta), y: o.cy + r * Math.sin(theta), w: typeof o.width === "number" ? o.width : o.width(theta) });
    if (theta >= o.thetaEnd) break;
    theta = Math.min(o.thetaEnd, theta + o.spacingMm / Math.max(r, 1));
  }
  return out;
}

export type GrooveProfile = {
  thetaEnd: number;
  thetaMusicStart: number;
  thetaMusicEnd: number;
  musicTurns: number;
  rInnermost: number;
  rBase: RadialFn;                        // radius of the groove axis, without modulation
  timeAt: (theta: number) => number | null; // audio time, or null outside the music
};

export function grooveProfile(p: RecordParams, musicSec: number): GrooveProfile {
  const pitch = pitchMm(p);
  // Lead-in: a quadratic r(theta) chosen so that where it meets the music the slope of the
  // spiral is IDENTICAL to the musical part. Without that the stylus hits a kink in the path and
  // jumps. It starts wide (easy to drop a needle into) and ends at exactly the groove pitch.
  const fPrime1 = pitch / p.leadInPitchMm;         // the required slope at the end of the lead-in
  const leadA = fPrime1 - 1, leadB = 2 - fPrime1;  // f(u) = a u^2 + b u, f(1)=1, f'(1)=fPrime1
  const turns = Math.max(1, Math.min(musicTurns(p), Math.ceil((musicSec * p.rpm) / 60)));
  const th1 = TWO_PI * p.leadInTurns;
  const th2 = th1 + TWO_PI * turns;
  const th3 = th2 + TWO_PI; // lead-out: one turn at the normal pitch
  const th4 = th3 + TWO_PI; // locked groove: one turn with no pitch at all
  const r1 = musicStartR(p);
  const r2 = r1 - turns * pitch;
  const rLocked = r2 - pitch;
  const omega = (TWO_PI * p.rpm) / 60;
  const leadDelta = p.leadInTurns * p.leadInPitchMm;
  const rBase: RadialFn = (th) =>
    th < th1 ? p.outerGrooveR - leadDelta * (leadA * (th / th1) ** 2 + leadB * (th / th1))
    : th < th2 ? r1 - (pitch * (th - th1)) / TWO_PI
    : th < th3 ? r2 - (pitch * (th - th2)) / TWO_PI
    : rLocked;
  const timeAt = (th: number) => (th >= th1 && th < th2 ? (th - th1) / omega : null);
  return { thetaEnd: th4, thetaMusicStart: th1, thetaMusicEnd: th2, musicTurns: turns, rInnermost: rLocked, rBase, timeAt };
}

/**
 * Radial excursion o(Theta) = A * x(t) * ramp(t), and 0 outside the music. The amplitude ramp in
 * and out (amplitudeRampSec) lets the stylus enter the modulation gradually instead of as a step.
 */
export function offsetFn(p: RecordParams, g: GrooveProfile, signal: Float32Array): RadialFn {
  const total = signal.length / p.sampleRate;
  const ramp = Math.max(1e-6, p.amplitudeRampSec);
  return (th) => {
    const t = g.timeAt(th);
    if (t === null) return 0;
    const env = Math.min(1, t / ramp, Math.max(0, total - t) / ramp);
    return p.amplitudeMm * env * sampleAt(signal, p.sampleRate, t);
  };
}
