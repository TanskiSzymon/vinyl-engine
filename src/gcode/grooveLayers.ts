// A groove layer. The groove is a V shaped TRENCH: in every layer k a pair of beads, L (outer)
// i R (wewnetrzny) o krawedziach wewnetrznych oddalonych o grooveGap + 2*k*wallStep. Dno rowu to
// wierzch podstawy, glebokosc = wallLayers * layerHeight. Igla siada na sciankach tam, gdzie
// the trench width matches the width of the stylus cone at that depth, as on a real record, only
// about five times coarser.
// Both beads of a pair carry the same signal s(t), which is lateral modulation.
//
// Land = przestrzen miedzy rowkiem n a n+1, wypelniana w KAZDEJ warstwie scianek, bo inaczej
// scianki stalyby jako osobne grzbiety. Nominalna szerokosc landu w warstwie k to
// pitch - 2*bead - gap - 2*k*wallStep, and it varies with the difference in signal between
// neighbouring turns, which is why E is modulated per segment.
import { polarPath, type GrooveProfile, type PathPoint, type RadialFn } from "../record/groove";
import { pitchMm, type RecordParams } from "../record/layout";
import type { GcodeWriter } from "./emit";
import { layerClimate } from "./base";

const TWO_PI = 2 * Math.PI;
const LAND_BITE = -0.06;     // leave the land SLIGHTLY under filled: an under filled land is
                             // harmless, an over filled one floods the groove
const LAND_MIN_W = 0.25, LAND_MAX_W = 0.55, LAND_TARGET_W = 0.6;

export type GroovePaths = { left: PathPoint[]; right: PathPoint[]; lands: PathPoint[][] };

/**
 * The seam (where a path starts) is scattered by the golden ratio: every wall and every layer
 * starts at a different angle, slightly BEFORE the groove's starting radius. Otherwise all the
 * starts and ends line up on one radius and form a ridge the stylus catches once per turn.
 */
function seamStart(index: number): number {
  return -((index * 0.618034) % 1) * 0.45 * TWO_PI;
}

export function grooveLayerPaths(p: RecordParams, g: GrooveProfile, offset: RadialFn, k: number): GroovePaths {
  const half = (p.beadWidthMm + p.grooveGapMm) / 2 + k * p.wallStepMm;
  // A scattered seam starts the path before the starting radius, so it is clipped to the edge of
  // the disc; otherwise the outer wall would run off the disc.
  const rimLimit = p.diameterMm / 2 - p.beadWidthMm / 2 - 0.2;
  const axis: RadialFn = (th) => Math.min(g.rBase(th) + offset(th), rimLimit - half);
  const rLeft: RadialFn = (th) => axis(th) + half;
  const rRight: RadialFn = (th) => axis(th) - half;
  const common = { cx: p.centerX, cy: p.centerY, spacingMm: p.pointSpacingMm };
  const left = polarPath({ ...common, thetaStart: seamStart(3 * k), thetaEnd: g.thetaEnd, radius: rLeft, width: p.beadWidthMm });
  const right = polarPath({ ...common, thetaStart: seamStart(3 * k + 1), thetaEnd: g.thetaEnd + 0.15 * TWO_PI, radius: rRight, width: p.beadWidthMm });

  const lands: PathPoint[][] = [];
  {
    const edgeOuter = (th: number) => rRight(th) - p.beadWidthMm / 2;          // wewnetrzna krawedz R obrotu n
    const edgeInner = (th: number) => rLeft(th + TWO_PI) + p.beadWidthMm / 2;  // zewnetrzna krawedz L obrotu n+1
    const nominal = pitchMm(p) - 2 * p.beadWidthMm - p.grooveGapMm - 2 * k * p.wallStepMm;
    const n = Math.max(1, Math.round(nominal / LAND_TARGET_W));
    for (let j = 0; j < n; j += 1) {
      lands.push(polarPath({
        cx: p.centerX, cy: p.centerY, thetaStart: g.thetaMusicStart, thetaEnd: g.thetaEnd - TWO_PI,
        spacingMm: p.landPointSpacingMm,
        radius: (th) => edgeInner(th) + ((j + 0.5) * (edgeOuter(th) - edgeInner(th))) / n,
        width: (th) => Math.min(LAND_MAX_W, Math.max(LAND_MIN_W, (edgeOuter(th) - edgeInner(th) + LAND_BITE) / n)),
      }));
    }
  }
  return { left, right, lands };
}

export function emitGrooveLayer(w: GcodeWriter, p: RecordParams, g: GrooveProfile, offset: RadialFn, k: number, z: number): void {
  w.layer(z);
  w.comment(`groove layer ${k + 1}/${p.wallLayers}`);
  layerClimate(w, p.baseLayers + k, 5000);
  const paths = grooveLayerPaths(p, g, offset, k);
  for (const bead of paths.lands) w.extrudePath(bead, p.landSpeedMmS, "Inner wall"); // land najpierw: scianki kladzione na koncu sa najczystsze
  w.extrudePath(paths.left, p.grooveSpeedMmS, "Outer wall");
  w.extrudePath(paths.right, p.grooveSpeedMmS, "Outer wall");
}
