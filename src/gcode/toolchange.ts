// Prawdziwa zmiana filamentu przez AMS (T0 -> Tn), odtworzona z procedury zapisanej w profilu
// printer profile (`change_filament_gcode` in the template). It is expanded here for the simple
// case at hand: one change, PLA to PLA, without the long retraction used when cutting.
//
// Every coordinate and command comes from the P1S profile rather than being invented. The values
// a slicer would compute from its purging matrix are given directly here as a purge volume.
import type { GcodeWriter } from "./emit";

export type ToolChangeOpts = {
  slot: number;              // numer narzedzia T (0 = taca 1 w AMS, 1 = taca 2, ...)
  z: number;                 // the current layer height
  nozzleTempC: number;       // temperatura obu filamentow (PLA 220)
  flushVolumeMm3: number;    // purge volume; the profile uses 140-175 mm3 for PLA to PLA
  retractToolchangeMm: number;
};

const MM3_PER_MM = 2.4053;   // przekroj filamentu 1.75 mm

/** Feed rate in mm/min for a given volumetric speed in mm3/s. */
const feed = (volumetricMm3s: number) => Math.round((volumetricMm3s / MM3_PER_MM) * 60);

export function emitToolChange(w: GcodeWriter, o: ToolChangeOpts): void {
  const flushMm = o.flushVolumeMm3 / MM3_PER_MM;
  const f = feed(21);        // the usual PLA purge speed in the Bambu profile
  const push = (s: string) => w.raw(s);

  push("; ===== zmiana filamentu (AMS) =====");
  push(`M620 S${o.slot}A`);
  push("M204 S9000");
  push(`G1 Z${(o.z + 3).toFixed(2)} F1200`);
  push("G1 X70 F21000");
  push("G1 Y245");
  push("G1 Y265 F3000");
  push("M400");
  push("M106 P1 S0");
  push("M106 P2 S0");
  push(`M104 S${o.nozzleTempC}`);
  push("M620.11 S0");
  push("M400");
  push("G1 X90 F3000");
  push("G1 Y255 F4000");
  push("G1 X100 F5000");
  push("G1 X120 F15000");
  push("G1 X20 Y50 F21000");
  push("G1 Y-3");
  push(`M620.1 E F${f} T${o.nozzleTempC}`);
  push(`T${o.slot}`);
  push(`M620.1 E F${f} T${o.nozzleTempC}`);
  push("M620.11 S0");
  push("G92 E0");
  // Purge: the first stretch continuous, then pulsed, exactly as the profile does it.
  push("M83");
  push("; FLUSH_START");
  push("M400");
  push(`M109 S${o.nozzleTempC}`);
  if (flushMm > 23.7) {
    const rest = flushMm - 23.7;
    push(`G1 E23.7 F${f}`);
    for (let i = 0; i < 4; i += 1) {
      push(`G1 E${(rest * 0.02).toFixed(2)} F50`);
      push(`G1 E${(rest * 0.23).toFixed(2)} F${f}`);
    }
  } else {
    push(`G1 E${flushMm.toFixed(2)} F${f}`);
  }
  push("; FLUSH_END");
  push(`G1 E-${o.retractToolchangeMm} F1800`);
  push(`G1 E${o.retractToolchangeMm} F300`);
  push("M400");
  push("G92 E0");
  push(`G1 E-${o.retractToolchangeMm} F1800`);
  push("M106 P1 S255");
  push("M400 S3");
  // Shake the ooze off and wipe the nozzle, exactly as the profile does it.
  for (const line of ["G1 X70 F5000", "G1 X90 F3000", "G1 Y255 F4000", "G1 X105 F5000", "G1 Y265 F5000",
    "G1 X70 F10000", "G1 X100 F5000", "G1 X70 F10000", "G1 X100 F5000", "G1 X70 F10000",
    "G1 X80 F15000", "G1 X60", "G1 X80", "G1 X60", "G1 X80 ; shake to put down garbage",
    "G1 X100 F5000", "G1 X165 F15000; wipe and shake", "G1 Y256 ; move Y aside"]) push(line);
  push("M400");
  push(`G1 Z${(o.z + 3).toFixed(2)} F3000`);
  push("M204 S5000");
  push(`M621 S${o.slot}A`);
  push("M106 P1 S0");
  push(`G1 Z${o.z.toFixed(2)} F600`);
  push(`G1 E${o.retractToolchangeMm} F1800`);
  push("; ===== koniec zmiany filamentu =====");
}
