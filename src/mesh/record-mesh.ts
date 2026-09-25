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
import { textPolys } from "../gcode/font";
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
  /** Up to two lines raised on the label, drawn with the same single stroke font as the G-code. */
  labelText: string[];
  labelCapMm: number;
  labelStrokeMm: number;
  labelReliefMm: number;
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
  labelText: [], labelCapMm: 7, labelStrokeMm: 1.0, labelReliefMm: 0.5,
  centerX: 128, centerY: 128,
};

/**
 * Mesh dimensions for a given nozzle. The defaults above are sized for 0.4 mm: the land has to
 * hold at least two extrusion paths and the groove walls need room for a perimeter each, or the
 * slicer will drop them. With a finer nozzle all of that shrinks, and the disc holds proportionally
 * more music, so the profile scales with extrusion width rather than being fixed.
 *
 * These are geometric consequences of the extrusion width, not measurements: unlike the G-code
 * path, nobody has printed a sliced 0.2 mm mesh end to end yet.
 */
export function meshNozzleProfile(nozzleMm: number): Partial<MeshParams> {
  if (nozzleMm >= 0.35) return {};
  const bead = nozzleMm * 1.1;
  const r = bead / 0.44;                       // scale relative to the 0.4 mm bead
  const round = (v: number) => Number(v.toFixed(2));
  return {
    grooveTopMm: round(Math.max(4 * bead, 1.6 * r)),
    grooveFloorMm: round(Math.max(1.2 * bead, 0.5 * r)),
    grooveDepthMm: round(Math.max(2.5 * bead, 0.7 * r)),
    landMm: round(Math.max(2.2 * bead, 0.9 * r)),   // at least two extrusion paths wide
    amplitudeMm: round(0.18 * r),
    thicknessMm: round(Math.max(1.4, 0.7 + 2.5 * bead)),
    stepsPerTurn: 3600,
  };
}

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
    rimTop.push(m.v(p.centerX + rRim * cos, p.centerY + rRim * sin, zFloor));
    rimBot.push(m.v(p.centerX + rRim * cos, p.centerY + rRim * sin, zBot));
    holeTop.push(m.v(p.centerX + rHole * cos, p.centerY + rHole * sin, zFloor));
    holeBot.push(m.v(p.centerX + rHole * cos, p.centerY + rHole * sin, zBot));
  }
  const w = (i: number) => i % N;

  // The flat rim band and the label plateau sit at FLOOR level, not at the top of the grooves, so
  // the grooved ring stands proud of the disc exactly as it does in the G-code path. That is what
  // makes a filament change at the floor height come out like the printed discs: base in one
  // colour, grooves and label text in the other.
  const vx = m.vertices;                  // snapshot: the rings below copy XY from the spiral
  const lowRing = (ids: number[], from: number, count: number) => {
    const out: number[] = [];
    for (let i = 0; i <= count; i += 1) {
      const idx = ids[from + i] * 3;
      out.push(m.v(vx[idx], vx[idx + 1], zFloor));
    }
    return out;
  };
  const aLow = lowRing(A, 0, N);          // under the first turn's outer edge
  const dLow = lowRing(D, M - N, N);      // under the last turn's inner edge

  // Outer: flat band from the rim to the first turn, then a wall up to the land.
  for (let i = 0; i < N; i += 1) {
    m.quad(rimTop[i], rimTop[w(i + 1)], aLow[i + 1], aLow[i]);
    m.quad(aLow[i], aLow[i + 1], A[i + 1], A[i]);
  }

  // Inner: a wall down from the last turn, then the flat label plateau to the hole.
  for (let i = 0; i < N; i += 1) {
    const j = M - N + i;
    m.quad(D[j], D[j + 1], dLow[i + 1], dLow[i]);
    m.quad(dLow[i], dLow[i + 1], holeTop[w(i + 1)], holeTop[i]);
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

  // The step of the spiral, now six sided because the band either side of the groove dropped to
  // floor level. The points lie on one radius, so these faces have zero area, but without them the
  // solid would not be closed: that is an unavoidable feature of a spiral on a disc, and a slicer
  // treats them as degenerate and ignores them.
  // The step of the spiral. Where the groove starts and ends, the band beside it drops to floor
  // level, so each seam is a six sided hole in one radial plane. Two fans close them. The faces
  // have zero area, but without them the solid is not closed: that is what a spiral on a disc
  // costs, and a slicer treats them as degenerate and ignores them.
  for (const [a, b, c, d, e, f] of [
    [rimTop[0], aLow[0], A[0], D[0], A[N], aLow[N]],
    [A[M], D[M - N], dLow[0], holeTop[0], dLow[N], D[M]],
  ]) {
    m.t(a, b, c); m.t(a, c, d); m.t(a, d, e); m.t(a, e, f);
  }

  emitLabelText(m, p, zFloor);

  return { mesh: m, turns, musicSec, stepsPerTurn: N };
}

/**
 * Raised label text on the plateau, drawn with the same single stroke font the G-code uses. Each
 * stroke segment becomes a closed box, so the strokes overlap at the joints; that is intentional
 * and a slicer unions them. Overlapping closed solids still leave every edge used exactly twice,
 * so the mesh stays watertight by the edge parity test.
 */
function emitLabelText(m: Mesh, p: MeshParams, zFloor: number): void {
  const lines = p.labelText.map((l) => l.trim()).filter(Boolean).slice(0, 2);
  if (lines.length === 0) return;
  const cap = p.labelCapMm, gap = cap * 0.55;
  const blockH = lines.length * cap + (lines.length - 1) * gap;
  const topBaseline = p.centerY + blockH / 2 - cap;
  const hw = p.labelStrokeMm / 2, zTop = zFloor + p.labelReliefMm;
  for (let li = 0; li < lines.length; li += 1) {
    const polys = textPolys(lines[li], { capHeightMm: cap, centerX: p.centerX, baselineY: topBaseline - li * (cap + gap) });
    for (const poly of polys) {
      for (let i = 0; i + 1 < poly.length; i += 1) {
        const a = poly[i], b = poly[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) continue;
        // A box around the segment, extended by half a stroke at each end so joints close up.
        const ux = dx / len, uy = dy / len, nx = -uy * hw, ny = ux * hw;
        const ax = a.x - ux * hw, ay = a.y - uy * hw, bx = b.x + ux * hw, by = b.y + uy * hw;
        const c = [
          [ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny],
        ];
        const lo = c.map(([x, y]) => m.v(x, y, zFloor));
        const hi = c.map(([x, y]) => m.v(x, y, zTop));
        m.quad(lo[3], lo[2], lo[1], lo[0]);            // bottom, facing down
        m.quad(hi[0], hi[1], hi[2], hi[3]);            // top
        for (let k = 0; k < 4; k += 1) {
          const n = (k + 1) % 4;
          m.quad(lo[k], lo[n], hi[n], hi[k]);
        }
      }
    }
  }
}
