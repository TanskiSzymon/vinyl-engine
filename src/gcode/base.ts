// The base of the disc: each layer is a single Archimedean spiral (no seams, and a concentric
// texture, since this is the floor of the grooves) plus a rim loop and a loop around the hole.
import { polarPath, type PathPoint } from "../record/groove";
import type { RecordParams } from "../record/layout";
import type { GcodeWriter } from "./emit";

const TWO_PI = 2 * Math.PI;

export function baseLayerPaths(p: RecordParams, layerIndex: number): PathPoint[][] {
  const w = layerIndex === 0 ? p.firstLayerWidthMm : p.beadWidthMm;
  const spiralPitch = w * 0.95; // lekkie zachodzenie = pelne wypelnienie
  // The hole: the first layer gets 0.15 mm of extra radius for elephant foot, since squashing the
  // first layer spreads the bead inward. The hole perimeter and the rim perimeter are
  // SEPARATE beads: the spiral starts one bead further in, because otherwise two beads land in
  // two beads would land in the same place, the surplus plastic runs into the hole, and the hole
  // comes out about 1 mm too small.
  const rHoleEdge = p.holeMm / 2 + (layerIndex === 0 ? 0.15 : 0);
  const rHole = rHoleEdge + w / 2;
  const rRim = p.diameterMm / 2 - w / 2;
  const thetaEnd = (TWO_PI * (rRim - w - (rHole + w))) / spiralPitch;
  const spiral = polarPath({
    cx: p.centerX, cy: p.centerY, thetaStart: 0, thetaEnd, spacingMm: 0.6,
    radius: (th) => rHole + w + (spiralPitch * th) / TWO_PI, width: w,
  });
  if (layerIndex % 2 === 1) spiral.reverse();
  const circle = (radius: number) => polarPath({ cx: p.centerX, cy: p.centerY, thetaStart: 0, thetaEnd: TWO_PI, spacingMm: 0.6, radius: () => radius, width: w });
  return [spiral, circle(rRim), circle(rHole)];
}

/** The Bambu PLA profile: first layer slow, fan off, acceleration 500; then full cooling. */
export function layerClimate(w: GcodeWriter, layerIndex: number, accelMmS2: number): void {
  if (layerIndex === 0) { w.setAccel(500); w.fan(0, 0); }
  else if (layerIndex === 1) { w.setAccel(accelMmS2); w.fan(153, 178); }
  else { w.setAccel(accelMmS2); w.fan(255, 178); }
}

export function emitBase(w: GcodeWriter, p: RecordParams, layerIndex: number, z: number): void {
  w.layer(z);
  w.comment(`base layer ${layerIndex + 1}/${p.baseLayers}`);
  layerClimate(w, layerIndex, 5000);
  const speed = layerIndex === 0 ? p.firstLayerSpeedMmS : p.baseSpeedMmS;
  const role = layerIndex === 0 ? "Bottom surface" : "Internal solid infill";
  w.setSimplifyTol(p.baseSimplifyTolMm);
  const [spiral, rim, hole] = baseLayerPaths(p, layerIndex);
  w.extrudePath(spiral, speed, role);
  w.extrudePath(rim, speed, "Outer wall");
  w.extrudePath(hole, speed, "Outer wall");
  w.setSimplifyTol(p.simplifyTolMm);
}
