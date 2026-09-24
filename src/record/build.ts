// Assembling the whole G-code file: template header -> base -> groove layers -> footer.
import { GcodeWriter } from "../gcode/emit";
import { emitBase } from "../gcode/base";
import { emitDecor } from "../gcode/decor";
import { emitToolChange } from "../gcode/toolchange";
import { emitGrooveLayer } from "../gcode/grooveLayers";
import { emitRingLayer, type Ring } from "../gcode/rings";
import { grooveProfile, offsetFn } from "./groove";
import { validate, baseTopZ, type RecordParams } from "./layout";
import { patchHeaderStats, type PrintMeta } from "../gcode/template";

const PLA_G_PER_MM = (Math.PI * 1.75 * 1.75) / 4 * 1.24 / 1000; // g na mm filamentu 1.75 (PLA 1.24 g/cm3)

export function printMeta(p: RecordParams, layers: number, s: { timeSec: number; filamentMm: number }): PrintMeta {
  const r = p.diameterMm / 2;
  return {
    layers, maxZ: baseTopZ(p) + (layers - p.baseLayers) * p.layerHeightMm, timeSec: s.timeSec, filamentMm: s.filamentMm,
    filamentG: s.filamentMm * PLA_G_PER_MM,
    bbox: [p.centerX - r, p.centerY - r, p.centerX + r, p.centerY + r],
    amsSlot: p.colorChange && p.amsSlot > 0 ? p.amsSlot : 0,
    colorChangeLayer: p.baseLayers,
  };
}

export type BuildStats = { timeSec: number; pathLengthMm: number; filamentMm: number; lines: number; musicSec: number; musicTurns: number; rInnermost: number; layers: number; meta: PrintMeta };

/** The base layers, possibly thicker than the groove layers. Returns the top of the base. */
function emitBaseStack(w: GcodeWriter, p: RecordParams): number {
  let z = 0;
  for (let i = 0; i < p.baseLayers; i += 1) {
    const h = i === 0 ? p.layerHeightMm : p.baseLayerHeightMm;
    w.setLayerHeight(h);
    z += h;
    emitBase(w, p, i, z);
  }
  w.setLayerHeight(p.layerHeightMm);
  return z;
}

/** A colour change: either a real AMS toolchange, or a pause for a manual spool swap. */
function changeColor(w: GcodeWriter, p: RecordParams, z: number): void {
  if (p.amsSlot > 0) {
    emitToolChange(w, { slot: p.amsSlot, z, nozzleTempC: 220, flushVolumeMm3: p.flushVolumeMm3, retractToolchangeMm: 2 });
  } else {
    w.colorChangePause();
  }
}

function newWriter(p: RecordParams): GcodeWriter {
  return new GcodeWriter({
    filamentDiameterMm: p.filamentDiameterMm, layerHeightMm: p.layerHeightMm, retractMm: 0.8,
    retractSpeedMmS: 30, travelSpeedMmS: 200, simplifyTolMm: p.simplifyTolMm, zHopMm: 0.2,
  });
}

export function buildRecordGcode(p: RecordParams, signal: Float32Array, header: string, footer: string): { gcode: string; stats: BuildStats } {
  const errors = validate(p);
  if (errors.length) throw new Error(errors.join("; "));
  const layers = p.baseLayers + p.wallLayers;
  const w = newWriter(p);
  w.setTotalLayers(layers);
  w.raw("__HEADER__");
  w.raw("; ===== vinyl-engine body =====");
  // ORDER MATTERS: in Marlin firmware (and Bambu's) G90 sets absolute mode for EVERY axis,
  // including E. M83 has to come AFTER G90, otherwise E stays absolute and the incremental
  // E0.025 per segment advances the filament by 0.025 mm once and never again.
  w.raw("G90"); w.raw("M83");
  const baseTop = emitBaseStack(w, p);
  const musicSec = signal.length / p.sampleRate;
  const g = grooveProfile(p, musicSec);
  const offset = offsetFn(p, g, signal);
  if (p.colorChange) changeColor(w, p, baseTop + p.layerHeightMm);
  for (let k = 0; k < p.wallLayers; k += 1) {
    emitGrooveLayer(w, p, g, offset, k, baseTop + (k + 1) * p.layerHeightMm);
    if (k < p.decorLayers) emitDecor(w, p);
  }
  w.raw("; ===== vinyl-engine end =====");
  w.raw(footer);
  const s = w.stats();
  const meta = printMeta(p, layers, s);
  const gcode = w.toString().replace("__HEADER__", patchHeaderStats(header, meta).trimEnd());
  return { gcode, stats: { ...s, musicSec, musicTurns: g.musicTurns, rInnermost: g.rInnermost, layers, meta } };
}

/** The matrix disc: a base plus ring layers, where layer k holds the rings with wallLayers > k. */
export function buildRingsGcode(p: RecordParams, rings: Ring[], header: string, footer: string): { gcode: string; stats: ReturnType<GcodeWriter["stats"]> & { layers: number; meta: PrintMeta } } {
  const errors = validate(p);
  if (errors.length) throw new Error(errors.join("; "));
  const maxLayers = Math.max(...rings.map((r) => r.wallLayers));
  const w = newWriter(p);
  w.setTotalLayers(p.baseLayers + maxLayers);
  w.raw("__HEADER__");
  w.raw("; ===== vinyl-engine matrix body =====");
  // ORDER MATTERS: in Marlin firmware (and Bambu's) G90 sets absolute mode for EVERY axis,
  // including E. M83 has to come AFTER G90, otherwise E stays absolute and the incremental
  // E0.025 per segment advances the filament by 0.025 mm once and never again.
  w.raw("G90"); w.raw("M83");
  const baseTop = emitBaseStack(w, p);
  if (p.colorChange) changeColor(w, p, baseTop + p.layerHeightMm);
  for (let k = 0; k < maxLayers; k += 1) {
    emitRingLayer(w, p, rings, k, baseTop + (k + 1) * p.layerHeightMm);
    if (k < p.decorLayers) emitDecor(w, p);
  }
  w.raw("; ===== vinyl-engine end =====");
  w.raw(footer);
  const layers = p.baseLayers + maxLayers;
  const meta = printMeta(p, layers, w.stats());
  const gcode = w.toString().replace("__HEADER__", patchHeaderStats(header, meta).trimEnd());
  return { gcode, stats: { ...w.stats(), layers, meta } };
}
