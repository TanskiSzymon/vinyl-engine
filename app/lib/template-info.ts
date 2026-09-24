// Reading the profile out of a template, so the user is told straight away whether their sliced
// file matches what the geometry assumes (a P1S, 0.4 mm nozzle, 0.2 mm layers).
import { strFromU8, unzipSync } from "fflate";

export type TemplateInfo = {
  printer: string; nozzleMm: number | null; layerMm: number | null; filament: string; bed: string;
  warnings: string[];
};

export function templateInfo(bytes: Uint8Array): TemplateInfo {
  const entries = unzipSync(bytes);
  const cfg = entries["Metadata/project_settings.config"];
  const info: TemplateInfo = { printer: "?", nozzleMm: null, layerMm: null, filament: "?", bed: "?", warnings: [] };
  if (cfg) {
    const d = JSON.parse(strFromU8(cfg)) as Record<string, unknown>;
    const first = (v: unknown) => (Array.isArray(v) ? String(v[0]) : v === undefined ? "?" : String(v));
    info.printer = first(d.printer_model);
    info.nozzleMm = Number(first(d.nozzle_diameter)) || null;
    info.layerMm = Number(first(d.layer_height)) || null;
    info.filament = first(d.filament_type);
    info.bed = first(d.curr_bed_type);
  }
  if (!Object.keys(entries).some((n) => /^Metadata\/plate_\d+\.gcode$/.test(n))) {
    info.warnings.push('That is not a sliced file. In Bambu Studio choose Export > "Export plate sliced file".');
  }
  if (info.nozzleMm !== null && Math.abs(info.nozzleMm - 0.4) > 0.001) {
    info.warnings.push(`The template declares a ${info.nozzleMm} mm nozzle, while the groove geometry here is computed for 0.4 mm.`);
  }
  if (info.layerMm !== null && Math.abs(info.layerMm - 0.2) > 0.001) {
    info.warnings.push(`The template uses ${info.layerMm} mm layers instead of 0.2 mm, so the extrusion amounts will be wrong.`);
  }
  if (info.printer !== "?" && !/P1S|P1P|X1|P2S/i.test(info.printer)) {
    info.warnings.push(`The template is for a ${info.printer}. Only the Bambu Lab P1S has been tested.`);
  }
  return info;
}
