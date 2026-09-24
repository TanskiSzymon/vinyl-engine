// Plyta-macierz wg Ghassaei (2012): zamkniete pierscienie z sinusami o roznych parametrach.
// Each ring is an L/R pair as in the spiral, but at a constant radius with an excursion
// A*sin(cycles*Theta). Land miedzy sasiednimi pierscieniami: n beadow o zmiennej szerokosci.
import { polarPath, type PathPoint } from "../record/groove";
import type { RecordParams } from "../record/layout";
import type { GcodeWriter } from "./emit";
import { layerClimate } from "./base";

const TWO_PI = 2 * Math.PI;
const LAND_BITE = -0.06, LAND_MIN_W = 0.25, LAND_MAX_W = 0.55, LAND_TARGET_W = 0.6; // a gap rather than an overlap: an over filled land floods the groove

export type Ring = {
  radiusMm: number; grooveGapMm: number; amplitudeMm: number; wallLayers: number; wallStepMm: number;
  cyclesPerRev: number; freqHz: number; note: string;
};

export type RingPaths = { walls: PathPoint[][]; lands: PathPoint[][] };

function halfWidth(p: RecordParams, ring: Ring, k: number): number {
  return (p.beadWidthMm + ring.grooveGapMm) / 2 + k * ring.wallStepMm;
}

export function ringLayerPaths(p: RecordParams, rings: Ring[], k: number): RingPaths {
  const axis = (ring: Ring) => (th: number) => ring.radiusMm + ring.amplitudeMm * Math.sin(ring.cyclesPerRev * th);
  const walls: PathPoint[][] = [];
  const lands: PathPoint[][] = [];
  // The seam (where a loop starts and stops) is placed at a different angle for every ring and
  // layer; otherwise all the blobs line up on one radius and the stylus catches them in the same
  // place every turn.
  const seam = (i: number) => ((i * 0.618 + k * 0.382) % 1) * TWO_PI;
  const common = (i: number) => ({ cx: p.centerX, cy: p.centerY, thetaStart: seam(i), thetaEnd: seam(i) + TWO_PI });
  rings.forEach((ring, i) => {
    if (ring.wallLayers <= k) return;
    const a = axis(ring), h = halfWidth(p, ring, k);
    walls.push(polarPath({ ...common(i), spacingMm: p.pointSpacingMm, radius: (th) => a(th) + h, width: p.beadWidthMm }));
    walls.push(polarPath({ ...common(i), spacingMm: p.pointSpacingMm, radius: (th) => a(th) - h, width: p.beadWidthMm }));
  });
  // A land in every layer, but only between rings that still have walls in that layer.
  for (let i = 0; i + 1 < rings.length; i += 1) {
    const outer = rings[i], inner = rings[i + 1];
    if (outer.wallLayers > k && inner.wallLayers > k) {
      const aO = axis(outer), aI = axis(inner);
      const edgeO = (th: number) => aO(th) - halfWidth(p, outer, k) - p.beadWidthMm / 2; // wewnetrzna krawedz R pierscienia i
      const edgeI = (th: number) => aI(th) + halfWidth(p, inner, k) + p.beadWidthMm / 2; // zewnetrzna krawedz L pierscienia i+1
      const nominal = (outer.radiusMm - halfWidth(p, outer, k) - p.beadWidthMm / 2) - (inner.radiusMm + halfWidth(p, inner, k) + p.beadWidthMm / 2);
      const n = Math.max(1, Math.round(nominal / LAND_TARGET_W));
      for (let j = 0; j < n; j += 1) {
        lands.push(polarPath({
          ...common(i + 100 * (j + 1)), spacingMm: p.landPointSpacingMm,
          radius: (th) => edgeI(th) + ((j + 0.5) * (edgeO(th) - edgeI(th))) / n,
          width: (th) => Math.min(LAND_MAX_W, Math.max(LAND_MIN_W, (edgeO(th) - edgeI(th) + LAND_BITE) / n)),
        }));
      }
    }
  }
  return { walls, lands };
}

export function emitRingLayer(w: GcodeWriter, p: RecordParams, rings: Ring[], k: number, z: number): void {
  w.layer(z);
  layerClimate(w, p.baseLayers + k, 5000);
  const { walls, lands } = ringLayerPaths(p, rings, k);
  for (const bead of lands) w.extrudePath(bead, p.landSpeedMmS, "Inner wall");
  let idx = 0;
  for (const ring of rings) {
    if (ring.wallLayers <= k) continue;
    w.comment(`ring r=${ring.radiusMm.toFixed(2)} f=${ring.freqHz.toFixed(0)}Hz gap=${ring.grooveGapMm} step=${ring.wallStepMm} A=${ring.amplitudeMm} layer=${k} ${ring.note}`);
    w.extrudePath(walls[idx], p.grooveSpeedMmS, "Outer wall"); w.extrudePath(walls[idx + 1], p.grooveSpeedMmS, "Outer wall");
    idx += 2;
  }
}
