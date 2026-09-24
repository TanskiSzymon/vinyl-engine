// A disc mesh for the user's own slicer (the 3MF you would upload to a model site).
//
// Here the groove is a SOLID, not a nozzle path, so the geometry has to be one a slicer can turn
// into sensible paths with a 0.4 mm nozzle. That changes the proportions compared with G-code
// mode: the groove is wider (about 1.6 mm across the top instead of 0.55) and sparser, because at
// least two extrusion paths have to fit in the land between grooves, otherwise the slicer fills
// the ridge with a single line or drops it altogether.
//
// Topology: the spiral carries four edges (top outer, floor outer, floor inner, top inner).
// Between consecutive turns a flat land joins the inner edge of turn n to the outer edge of turn
// n+1, that is points exactly one revolution apart, which is why the number of angular steps per
// revolution has to be constant.
import { sampleAt } from "../record/groove";
import { Mesh } from "./mesh";

const TWO_PI = 2 * Math.PI;

export type MeshParams = {
  diameterMm: number;
  holeMm: number;
  thicknessMm: number;
  outerGrooveR: number;
  innerGrooveR: number;
  rpm: number;
  /** Groove width at the top and at the floor, and its depth. */
  grooveTopMm: number;
  grooveFloorMm: number;
  grooveDepthMm: number;
  /** The flat ridge between grooves at zero excursion. */
  landMm: number;
  amplitudeMm: number;
  leadInTurns: number;
  leadInPitchMm: number;
  /** Angular steps per revolution: this sets both waveform fidelity and file size. */
  stepsPerTurn: number;
  sampleRate: number;
  centerX: number;
  centerY: number;
};

export const MESH_DEFAULTS: Omit<MeshParams, "sampleRate"> = {
  diameterMm: 250, holeMm: 7.5, thicknessMm: 2.0,
  outerGrooveR: 122, innerGrooveR: 58, rpm: 45,
  grooveTopMm: 1.6, grooveFloorMm: 0.5, grooveDepthMm: 0.7,
  landMm: 0.9, amplitudeMm: 0.18,
  leadInTurns: 1, leadInPitchMm: 3,
  stepsPerTurn: 2400,
  centerX: 128, centerY: 128,
};

export function meshPitchMm(p: MeshParams): number {
  return p.grooveTopMm + 2 * p.amplitudeMm + p.landMm;
}

export function meshMaxDurationSec(p: MeshParams): number {
  const usable = p.outerGrooveR - p.leadInTurns * p.leadInPitchMm - p.innerGrooveR;
  return (Math.max(1, Math.floor(usable / meshPitchMm(p)) - 1) * 60) / p.rpm;
}

export type RecordMesh = { mesh: Mesh; turns: number; musicSec: number; stepsPerTurn: number };

export function buildRecordMesh(p: MeshParams, signal: Float32Array): RecordMesh {
  const pitch = meshPitchMm(p);
  const N = p.stepsPerTurn;
  const rLead = p.outerGrooveR;
  const rMusicStart = rLead - p.leadInTurns * p.leadInPitchMm;
  const musicSec = Math.min(signal.length / p.sampleRate, meshMaxDurationSec(p));
  const turns = Math.max(1, Math.ceil((musicSec * p.rpm) / 60));
  const totalTurns = p.leadInTurns + turns + 1;          // rozbieg + muzyka + wybieg
  const M = Math.round(totalTurns * N);                   // steps along the spiral
  const omega = (TWO_PI * p.rpm) / 60;
  const zTop = p.thicknessMm, zFloor = p.thicknessMm - p.grooveDepthMm, zBot = 0;

  // Radius of the groove axis: a coarser lead-in, then a constant pitch, then the lead-out.
  const thMusic = TWO_PI * p.leadInTurns;
  const thEnd = thMusic + TWO_PI * turns;
  const axis = (th: number) => {
    if (th < thMusic) return rLead - (p.leadInPitchMm * th) / TWO_PI;
    if (th < thEnd) return rMusicStart - (pitch * (th - thMusic)) / TWO_PI;
    return rMusicStart - pitch * turns - (pitch * (th - thEnd)) / TWO_PI;
  };
  // Excursion: the signal only inside the musical part, ramped in and out over 0.3 s.
  const ramp = 0.3;
  const offset = (th: number) => {
    if (th < thMusic || th >= thEnd) return 0;
    const t = (th - thMusic) / omega;
    const env = Math.min(1, t / ramp, Math.max(0, musicSec - t) / ramp);
    return p.amplitudeMm * env * sampleAt(signal, p.sampleRate, t);
  };

  const m = new Mesh();
  const halfTop = p.grooveTopMm / 2, halfFloor = p.grooveFloorMm / 2;
  const A: number[] = [], B: number[] = [], C: number[] = [], D: number[] = [];
  for (let i = 0; i <= M; i += 1) {
    const th = (TWO_PI * i) / N;
    const r = axis(th) + offset(th);
    const cos = Math.cos(th), sin = Math.sin(th);
    const at = (rr: number, z: number) => m.v(p.centerX + rr * cos, p.centerY + rr * sin, z);
    A.push(at(r + halfTop, zTop));
    B.push(at(r + halfFloor, zFloor));
    C.push(at(r - halfFloor, zFloor));
    D.push(at(r - halfTop, zTop));
  }

  // The groove walls along the spiral. Vertex order is chosen so the normals point upward.
  for (let i = 0; i < M; i += 1) {
    m.quad(A[i], A[i + 1], B[i + 1], B[i]);   // outer wall, descending to the floor
    m.quad(B[i], B[i + 1], C[i + 1], C[i]);   // the floor
    m.quad(C[i], C[i + 1], D[i + 1], D[i]);   // inner wall, rising again
  }

  // The land: the flat ridge between turn n and n+1, that is between D(i) and A(i+N).
  for (let i = 0; i + N + 1 <= M; i += 1) {
    m.quad(D[i], D[i + 1], A[i + N + 1], A[i + N]);
  }

  // The rim and hole rings are built as CLOSED loops (index modulo N) so no seam appears that
  // would need extra faces to patch.
  const rRim = p.diameterMm / 2, rHole = p.holeMm / 2;
  const rimTop: number[] = [], rimBot: number[] = [], holeTop: number[] = [], holeBot: number[] = [];
  for (let i = 0; i < N; i += 1) {
    const th = (TWO_PI * i) / N, cos = Math.cos(th), sin = Math.sin(th);
    rimTop.push(m.v(p.centerX + rRim * cos, p.centerY + rRim * sin, zTop));
    rimBot.push(m.v(p.centerX + rRim * cos, p.centerY + rRim * sin, zBot));
    holeTop.push(m.v(p.centerX + rHole * cos, p.centerY + rHole * sin, zTop));
    holeBot.push(m.v(p.centerX + rHole * cos, p.centerY + rHole * sin, zBot));
  }
  const w = (i: number) => i % N;

  // Top face: the band from the edge of the disc to the outer edge of the first turn.
  for (let i = 0; i < N; i += 1) m.quad(rimTop[i], rimTop[w(i + 1)], A[i + 1], A[i]);

  // Top face: the band from the inner edge of the last turn to the hole.
  for (let i = 0; i < N; i += 1) {
    const j = M - N + i;
    m.quad(D[j], D[j + 1], holeTop[w(i + 1)], holeTop[i]);
  }

  // The underside, the outer wall and the wall of the hole.
  for (let i = 0; i < N; i += 1) {
    const k = w(i + 1);
    m.quad(rimBot[i], holeBot[i], holeBot[k], rimBot[k]);
    m.quad(rimTop[i], rimBot[i], rimBot[k], rimTop[k]);
    m.quad(holeTop[i], holeTop[k], holeBot[k], holeBot[i]);
  }

  // Caps at the start and the end of the groove: the vertical A-B-C-D section closes the solid.
  m.quad(A[0], B[0], C[0], D[0]);
  m.quad(D[M], C[M], B[M], A[M]);

  // The step of the spiral. The start of the groove leaves a closed loop
  // rimTop[0]-A[0]-D[0]-A[N] in the plane of the top face, and the end leaves its mirror. The
  // points lie on one radius, so these faces have zero area, but without them the solid would not
  // be closed: that is an unavoidable feature of a spiral on a disc. A slicer sees them as
  // degenerate and ignores them.
  m.quad(rimTop[0], A[0], D[0], A[N]);
  m.quad(D[M], A[M], D[M - N], holeTop[0]);

  return { mesh: m, turns, musicSec, stepsPerTurn: N };
}
