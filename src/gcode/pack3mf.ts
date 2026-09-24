// Swapping the G-code inside a .gcode.3mf template: the G-code plus its MD5 (the printer checks
// it), with the rest of the archive (thumbnail, plate_1.json, slice_info) left untouched.
import { strFromU8, strToU8, zipSync } from "fflate";
import { md5Hex } from "./md5";
import type { PrintMeta, Template } from "./template";

/**
 * The archive metadata describes the cube too: plate_1.json carries its 10x10 mm bounding box and
 * slice_info.config a 612 s print, 0.76 g of filament and layers 0-49. Bambu Studio shows those
 * in the preview and the printer on its screen, so they are replaced with the disc's numbers.
 */
/**
 * Two filaments in the metadata: without this the print dialog shows a single tray even when the
 * G-code really does switch to the second one. The layer ranges tell Studio which filament
 * applies where.
 */
function patchTwoFilaments(entries: Record<string, Uint8Array>, m: PrintMeta): void {
  if (!m.amsSlot || m.colorChangeLayer === undefined) return;
  const slice = "Metadata/slice_info.config";
  if (entries[slice]) {
    let x = strFromU8(entries[slice]);
    const first = /<filament id="1"[^>]*\/>/.exec(x);
    if (first) {
      const second = first[0]
        .replace('id="1"', `id="${m.amsSlot + 1}"`)
        .replace(/color="[^"]*"/, 'color="#FFFFFF"')
        .replace(/used_m="[^"]*"/, `used_m="${(m.filamentMm / 2000).toFixed(2)}"`)
        .replace(/used_g="[^"]*"/, `used_g="${(m.filamentG / 2).toFixed(2)}"`);
      x = x.replace(first[0], `${first[0]}\n    ${second}`);
    }
    x = x.replace(/<layer_filament_list [^>]*\/>/,
      `<layer_filament_list filament_list="0" layer_ranges="0 ${m.colorChangeLayer - 1}" />\n      ` +
      `<layer_filament_list filament_list="${m.amsSlot}" layer_ranges="${m.colorChangeLayer} ${m.layers - 1}" />`);
    entries[slice] = strToU8(x);
  }
  const jsonName = Object.keys(entries).find((n) => /^Metadata\/plate_\d+\.json$/.test(n));
  if (jsonName) {
    try {
      const j = JSON.parse(strFromU8(entries[jsonName])) as Record<string, unknown>;
      const colors = Array.isArray(j.filament_colors) ? (j.filament_colors as string[]) : ["#F99963"];
      j.filament_colors = [colors[0], "#FFFFFF"];
      j.filament_ids = [0, m.amsSlot];
      entries[jsonName] = strToU8(JSON.stringify(j));
    } catch { /* zostawiamy oryginal */ }
  }
}

function patchMetadata(entries: Record<string, Uint8Array>, m: PrintMeta): void {
  const jsonName = Object.keys(entries).find((n) => /^Metadata\/plate_\d+\.json$/.test(n));
  if (jsonName) {
    try {
      const j = JSON.parse(strFromU8(entries[jsonName])) as Record<string, unknown>;
      j.bbox_all = m.bbox;
      if (Array.isArray(j.bbox_objects) && j.bbox_objects.length) {
        const o = j.bbox_objects[0] as Record<string, unknown>;
        o.bbox = m.bbox; o.name = "Record"; o.area = (m.bbox[2] - m.bbox[0]) * (m.bbox[3] - m.bbox[1]);
      }
      j.first_layer_time = Math.round(m.timeSec / Math.max(1, m.layers));
      entries[jsonName] = strToU8(JSON.stringify(j));
    } catch { /* zostawiamy oryginal */ }
  }
  const sliceName = "Metadata/slice_info.config";
  if (entries[sliceName]) {
    let x = strFromU8(entries[sliceName]);
    x = x.replace(/<metadata key="prediction" value="[^"]*"\/>/, `<metadata key="prediction" value="${Math.round(m.timeSec)}"/>`)
      .replace(/<metadata key="weight" value="[^"]*"\/>/, `<metadata key="weight" value="${m.filamentG.toFixed(2)}"/>`)
      .replace(/used_m="[^"]*"/, `used_m="${(m.filamentMm / 1000).toFixed(2)}"`)
      .replace(/used_g="[^"]*"/, `used_g="${m.filamentG.toFixed(2)}"`)
      .replace(/layer_ranges="[^"]*"/, `layer_ranges="0 ${Math.max(0, m.layers - 1)}"`)
      .replace(/<object identify_id="(\d+)" name="[^"]*"/, '<object identify_id="$1" name="Record"');
    entries[sliceName] = strToU8(x);
  }
}

export function packGcode3mfBytes(t: Template, fullGcode: string, meta?: PrintMeta): Uint8Array {
  const entries = { ...t.entries };
  if (meta) { patchMetadata(entries, meta); patchTwoFilaments(entries, meta); }
  const gcodeBytes = strToU8(fullGcode);
  entries[t.gcodeName] = gcodeBytes;
  entries[`${t.gcodeName}.md5`] = strToU8(md5Hex(gcodeBytes).toUpperCase());
  return zipSync(entries, { level: 6 });
}
