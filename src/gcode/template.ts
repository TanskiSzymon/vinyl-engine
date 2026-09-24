// A template is any small object sliced in Bambu Studio with the user's own profile and saved as
// .gcode.3mf (Eksport -> Export plate sliced file). Bierzemy z niego naglowek (start G-code
// drukarki: leveling, purge, temperatury) i stopke (koniec: wylaczenie grzania, parkowanie).
import { strFromU8, unzipSync } from "fflate";

export type Template = { entries: Record<string, Uint8Array>; gcodeName: string; gcode: string };

/** Reads a template from bytes, which works the same in Node and in the browser. */
export function readTemplateBytes(bytes: Uint8Array): Template {
  const entries = unzipSync(bytes);
  const gcodeName = Object.keys(entries).find((n) => /^Metadata\/plate_\d+\.gcode$/.test(n));
  if (!gcodeName) throw new Error('W szablonie brak Metadata/plate_N.gcode - wyeksportuj z Bambu Studio "sliced file"');
  return { entries, gcodeName, gcode: strFromU8(entries[gcodeName]) };
}

/**
 * The template header declares the layer count of the sliced cube (50, say). The printer uses it
 * for the progress bar and the timelapse, so it is replaced with the disc's own layer count.
 */
export function patchLayerCount(header: string, layers: number): string {
  return header
    .replace(/^; total layer number: \d+$/m, `; total layer number: ${layers}`)
    .replace(/^; total_layer_number: \d+$/m, `; total_layer_number: ${layers}`)
    // The cube's progress marks (P55 after warm-up) would fight with ours, which start at P0.
    .replace(/^M73 P\d+ R\d+\s*$/gm, "");
}

/**
 * CRITICAL: Bambu Studio writes the bed levelling probe area (G29 A X Y I J) into the start
 * G-code for the bounding box of the sliced object only. A template made from a 10 mm cube says
 * "G29 A X123 Y123 I10 J10", a mesh probed over 1 cm2 in the middle of the bed, while the disc is
 * 25 cm across. Outside the probed square the firmware does not know the bed height, so the first
 * layer lands too high or too low. The area is replaced with the disc's bounding box plus a
 * margin, clipped to the bed.
 */
export function patchLevelingArea(header: string, cx: number, cy: number, radiusMm: number, bedMm: number): string {
  const margin = 5;
  const x0 = Math.max(0, Math.floor(cx - radiusMm - margin));
  const y0 = Math.max(0, Math.floor(cy - radiusMm - margin));
  const x1 = Math.min(bedMm, Math.ceil(cx + radiusMm + margin));
  const y1 = Math.min(bedMm, Math.ceil(cy + radiusMm + margin));
  return header.replace(/^(\s*)G29 A X[\d.]+ Y[\d.]+ I[\d.]+ J[\d.]+(.*)$/m, `$1G29 A X${x0} Y${y0} I${x1 - x0} J${y1 - y0}$2`);
}

export type PrintMeta = {
  layers: number; maxZ: number; timeSec: number; filamentMm: number; filamentG: number;
  bbox: [number, number, number, number]; // x0 y0 x1 y1, the bounding box of the disc
  /** AMS tool for the second colour (0 = a single filament, or a manual pause). */
  amsSlot?: number;
  /** Warstwa, od ktorej obowiazuje drugi filament (liczona od 0). */
  colorChangeLayer?: number;
};

const fmtTime = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60);
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
};

/**
 * The HEADER_BLOCK from the cube says "max_z_height: 10.00", "total layer number: 50" and a
 * 10 minute print time.
 * Bambu Studio and the printer screen read these values, so they are replaced with ours.
 */
export function patchHeaderStats(header: string, m: PrintMeta): string {
  return header
    .replace(/^; model printing time: .*$/m, `; model printing time: ${fmtTime(m.timeSec)}; total estimated time: ${fmtTime(m.timeSec + 180)}`)
    .replace(/^; total layer number: \d+$/m, `; total layer number: ${m.layers}`)
    .replace(/^; total filament length \[mm\] : .*$/m, `; total filament length [mm] : ${m.filamentMm.toFixed(2)}`)
    .replace(/^; total filament volume \[cm\^3\] : .*$/m, `; total filament volume [cm^3] : ${((m.filamentMm * Math.PI * 1.75 * 1.75) / 4 / 1000).toFixed(2)}`)
    .replace(/^; total filament weight \[g\] : .*$/m, `; total filament weight [g] : ${m.filamentG.toFixed(2)}`)
    .replace(/^; max_z_height: .*$/m, `; max_z_height: ${m.maxZ.toFixed(2)}`);
}

/**
 * A template sliced with a 0.4 mm nozzle profile declares that nozzle. With any other nozzle the
 * printer compares "; nozzle_diameter" against the nozzle that is installed and refuses to print,
 * so this rewrites the declared nozzle and layer height. The start G-code itself (the purge
 * line) is left alone, since it is only a purge.
 */
export function patchNozzle(header: string, nozzleMm: number, layerHeightMm: number): string {
  return header
    .replace(/^; nozzle_diameter = .*$/m, `; nozzle_diameter = ${nozzleMm}`)
    .replace(/^; layer_height = .*$/m, `; layer_height = ${layerHeightMm}`)
    .replace(/^; first_layer_height = .*$/m, `; first_layer_height = ${layerHeightMm}`);
}

/** Disables the spaghetti detector (M981). The surface of a disc is hundreds of thin rings,
 *  which is an easy false alarm. */
export function disableSpaghettiDetector(header: string): string {
  return header.replace(/^(M981 .*)$/m, "; $1  ; disabled by vinyl-engine (--no-spaghetti)");
}

export function splitGcode(gcode: string): { header: string; footer: string } {
  const lines = gcode.split("\n");
  const iLayer = lines.findIndex((l) => l.startsWith("; CHANGE_LAYER"));
  const iEnd = lines.findIndex((l) => l.startsWith("; MACHINE_END_GCODE_START"));
  if (iLayer < 0) throw new Error("Brak znacznika '; CHANGE_LAYER' w G-code szablonu");
  if (iEnd < 0) throw new Error("Brak znacznika '; MACHINE_END_GCODE_START' w G-code szablonu");
  return { header: lines.slice(0, iLayer).join("\n") + "\n", footer: lines.slice(iEnd).join("\n") };
}
