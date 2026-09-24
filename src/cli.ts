// The command line interface: generate | melody | matrix | smoke | calib | calibrate | analyze |
// model. No UI, no server.
import { parseArgs } from "node:util";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { decodeToMono } from "./audio/decode";
import { playbackPreview, prepareSignal } from "./audio/prepare";
import { readWav16, writeWav16 } from "./audio/wav";
import { normalizePeak } from "./audio/dsp";
import { DECOR_STYLES } from "./gcode/decor";
import { TUNES, tuneById } from "./audio/melody";
import { buildRecordMesh, MESH_DEFAULTS, meshMaxDurationSec, meshNozzleProfile, meshPitchMm, type MeshParams } from "./mesh/record-mesh";
import { write3mf } from "./mesh/write3mf";
import { packGcode3mf, readTemplate } from "./gcode/template-node";
import { disableSpaghettiDetector, patchLayerCount, patchLevelingArea, patchNozzle, splitGcode, type PrintMeta, type Template } from "./gcode/template";
import { buildRecordGcode, buildRingsGcode } from "./record/build";
import { DEFAULT_PARAMS, lowpassForRpm, maxDurationSec, nozzleProfile, trackableHz, validate, withOverrides, type RecordParams } from "./record/layout";
import { calibProgram, calibrationProgram, matrixRings, melodyProgram, QUICK_RING_DEFS, radiusAtSec, smokeProgram, withRadii, type Segment } from "./programs";
import { alignOffset, buildProfile, measureBlocksAuto, type CalibrationProfile } from "./analysis/calibrate";
import { MULTITONE_FREQS } from "./audio/multitone";
import { resample } from "./audio/resample";
import { analyzeSegments } from "./analysis/analyze";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    template: { type: "string" }, out: { type: "string" }, preview: { type: "string" },
    "gcode-only": { type: "boolean" }, segments: { type: "string" }, offset: { type: "string" },
    rpm: { type: "string" }, diameter: { type: "string" }, amp: { type: "string" }, gap: { type: "string" },
    lowpass: { type: "string" }, "no-riaa": { type: "boolean" }, "wall-layers": { type: "string" },
    "outer-r": { type: "string" }, "inner-r": { type: "string" }, "base-layers": { type: "string" },
    speed: { type: "string" }, drive: { type: "string" }, "no-spaghetti": { type: "boolean" }, quick: { type: "boolean" }, nozzle: { type: "string" }, start: { type: "string" }, length: { type: "string" }, hole: { type: "string" }, calibration: { type: "string" }, "color-change": { type: "boolean" }, decor: { type: "string" }, "decor-layers": { type: "string" }, "ams-slot": { type: "string" }, text: { type: "string" }, "text-size": { type: "string" }, presence: { type: "string" }, compression: { type: "string" }, tune: { type: "string" }, watermark: { type: "string" }, model: { type: "boolean" }, steps: { type: "string" }, thickness: { type: "string" },
    "groove-top": { type: "string" }, "groove-floor": { type: "string" }, "groove-depth": { type: "string" }, land: { type: "string" },
  },
});

function params(): RecordParams {
  const o: Partial<RecordParams> = typeof values.nozzle === "string" ? { ...nozzleProfile(Number(values.nozzle)) } : {};
  const num = (k: keyof typeof values, f: keyof RecordParams) => {
    const v = values[k];
    if (typeof v === "string") (o as Record<string, unknown>)[f] = Number(v);
  };
  num("rpm", "rpm"); num("diameter", "diameterMm"); num("amp", "amplitudeMm"); num("gap", "grooveGapMm");
  num("lowpass", "lowpassHz"); num("wall-layers", "wallLayers"); num("outer-r", "outerGrooveR"); num("inner-r", "innerGrooveR");
  num("base-layers", "baseLayers"); num("speed", "grooveSpeedMmS"); num("drive", "driveDb"); num("hole", "holeMm"); num("decor-layers", "decorLayers"); num("presence", "presenceDb"); num("compression", "compressionDb");
  if (values["no-riaa"]) o.riaaPreEmphasis = false;
  if (values["color-change"]) o.colorChange = true;
  if (typeof values["ams-slot"] === "string") { o.colorChange = true; o.amsSlot = Number(values["ams-slot"]); }
  if (typeof values.text === "string") o.labelText = values.text.split("|").slice(0, 2);
  if (typeof values.watermark === "string") o.watermark = values.watermark;
  if (typeof values["text-size"] === "string") o.labelTextHeightMm = Number(values["text-size"]);
  if (typeof values.decor === "string") {
    if (!(DECOR_STYLES as string[]).includes(values.decor)) { console.error(`--decor: ${DECOR_STYLES.join(" | ")}`); process.exit(2); }
    o.decorStyle = values.decor as RecordParams["decorStyle"];
  }
  if (typeof values.rpm === "string" && typeof values.lowpass !== "string") o.lowpassHz = lowpassForRpm(Number(values.rpm), o.lowpassHz ?? DEFAULT_PARAMS.lowpassHz);
  if (values.quick) { o.diameterMm = 170; o.outerGrooveR = 82; o.baseLayers = 5; }
  if (typeof values.diameter === "string" && typeof values["outer-r"] !== "string") o.outerGrooveR = Number(values.diameter) / 2 - 3;
  if (typeof values.amp === "string" && typeof values["wall-layers"] === "string") {
    const need = 2 * Number(values.amp) + 2 * (Number(values["wall-layers"]) - 1) * DEFAULT_PARAMS.wallStepMm + 0.25;
    if (DEFAULT_PARAMS.landMinMm < need) o.landMinMm = Math.ceil(need * 100) / 100;
  }
  const p = withOverrides(DEFAULT_PARAMS, o);
  const errors = validate(p);
  if (errors.length) { console.error("Invalid parameters:\n - " + errors.join("\n - ")); process.exit(2); }
  return p;
}

function headerFooter(p: RecordParams, layers: number): { tpl: Template | null; header: string; footer: string } {
  if (!values.template) {
    return { tpl: null, header: "; no template\nM83\nG90\n", footer: "M104 S0\nM140 S0\nM84\n" };
  }
  const tpl = readTemplate(values.template);
  const { header, footer } = splitGcode(tpl.gcode);
  let h = patchLevelingArea(patchLayerCount(header, layers), p.centerX, p.centerY, p.diameterMm / 2, p.bedMm);
  h = patchNozzle(h, p.nozzleMm, p.layerHeightMm);
  if (values["no-spaghetti"]) h = disableSpaghettiDetector(h);
  return { tpl, header: h, footer };
}

/** Output directories are created on demand, so `--out out/record.gcode.3mf` works on a fresh clone. */
function ensureDir(file: string): void {
  mkdirSync(dirname(file), { recursive: true });
}

function writeOut(tpl: Template | null, gcode: string, meta: PrintMeta): void {
  ensureDir(values.out!);
  if (tpl && !values["gcode-only"]) packGcode3mf(tpl, gcode, values.out!, meta);
  else writeFileSync(values.out!, gcode);
}

function report(label: string, gcode: string, timeSec: number, extra: string): void {
  console.log(`${label}: ${values.out}`);
  console.log(`  ${extra}`);
  console.log(`  estimated ${(timeSec / 3600).toFixed(2)} h, ${(gcode.length / 1e6).toFixed(1)} MB`);
  if (!values.template) console.log("  NOTE: without --template the file has no printer start or end G-code, so it is preview only.");
}

/**
 * Model mode: instead of finished G-code, hand back a 3MF solid the user slices themselves. The
 * groove is wider there, because a slicer needs room for its own paths in the land between grooves.
 */
async function buildModel(): Promise<void> {
  const p = params();
  const mp: MeshParams = {
    ...MESH_DEFAULTS,
    ...(typeof values.nozzle === "string" ? meshNozzleProfile(Number(values.nozzle)) : {}),
    sampleRate: p.sampleRate,
    diameterMm: p.diameterMm, holeMm: p.holeMm, rpm: p.rpm,
    outerGrooveR: p.outerGrooveR, innerGrooveR: p.innerGrooveR,
    amplitudeMm: typeof values.amp === "string" ? Number(values.amp) : MESH_DEFAULTS.amplitudeMm,
    thicknessMm: typeof values.thickness === "string" ? Number(values.thickness) : MESH_DEFAULTS.thicknessMm,
    stepsPerTurn: typeof values.steps === "string" ? Number(values.steps) : MESH_DEFAULTS.stepsPerTurn,
    grooveTopMm: typeof values["groove-top"] === "string" ? Number(values["groove-top"]) : MESH_DEFAULTS.grooveTopMm,
    grooveFloorMm: typeof values["groove-floor"] === "string" ? Number(values["groove-floor"]) : MESH_DEFAULTS.grooveFloorMm,
    grooveDepthMm: typeof values["groove-depth"] === "string" ? Number(values["groove-depth"]) : MESH_DEFAULTS.grooveDepthMm,
    landMm: typeof values.land === "string" ? Number(values.land) : MESH_DEFAULTS.landMm,
    centerX: 0, centerY: 0,   // the model is centred on the origin; the slicer places it on the bed
  };
  const budget = meshMaxDurationSec(mp);
  let signal: Float32Array;
  let title = "Vinyl-Engine record";
  if (positionals[0] === "model") {
    const raw = await decodeToMono(positionals[1], p.sampleRate);
    signal = prepareSignal(raw, withOverrides(p, { amplitudeMm: mp.amplitudeMm }), {
      startSec: Number(values.start ?? 0), lengthSec: budget,
      radiusAtSec: (t) => mp.outerGrooveR - (meshPitchMm(mp) * t * mp.rpm) / 60,
    });
  } else {
    const tune = tuneById(values.tune ?? "entertainer");
    title = tune.title;
    const prog = melodyProgram(p.sampleRate, budget, tune.id);
    signal = normalizePeak(prepareSignal(prog.signal, withOverrides(p, { highpassHz: 20, amplitudeMm: mp.amplitudeMm }), {
      trim: false, radiusAtSec: (t) => mp.outerGrooveR - (meshPitchMm(mp) * t * mp.rpm) / 60,
    }), 1);
  }
  const { mesh, turns, musicSec } = buildRecordMesh(mp, signal);
  const bad = mesh.checkManifold(1);
  if (bad.length) throw new Error(`the mesh is not watertight: ${bad[0]}`);
  const bytes = write3mf(mesh, title);
  ensureDir(values.out!);
  writeFileSync(values.out!, bytes);
  console.log(`model: ${values.out}`);
  console.log(`  music ${musicSec.toFixed(1)} s / max ${budget.toFixed(1)} s, ${turns} turns, pitch ${meshPitchMm(mp).toFixed(2)} mm`);
  console.log(`  ${mesh.vertexCount.toLocaleString("en")} vertices, ${mesh.triangleCount.toLocaleString("en")} triangles, ${(bytes.length / 1e6).toFixed(1)} MB`);
  console.log("  slice it with: 0.4 mm nozzle, 0.2 mm layers, PLA, 100% infill in the top layers");
}

async function main() {
  const cmd = positionals[0];
  if (cmd === "model" || cmd === "model-melody") { await buildModel(); return; }
  if (!values.out && cmd !== "analyze" && cmd !== undefined) throw new Error("--out is required");

  if (cmd === "generate") {
    const p = params();
    const raw = await decodeToMono(positionals[1], p.sampleRate);
    const calibration = values.calibration ? (JSON.parse(readFileSync(values.calibration, "utf8")) as CalibrationProfile) : undefined;
    if (calibration && (calibration.source.rpm !== p.rpm || Math.abs(calibration.source.lowpassHz - p.lowpassHz) > 30)) {
      console.warn(`NOTE: the calibration was made at ${calibration.source.rpm} rpm / lowpass ${calibration.source.lowpassHz}, but you are generating ${p.rpm} rpm / ${p.lowpassHz}.`);
    }
    const signal = prepareSignal(raw, p, { startSec: Number(values.start ?? 0), lengthSec: Number(values.length ?? 0), calibration, radiusAtSec: (t) => radiusAtSec(p, t) });
    const { tpl, header, footer } = headerFooter(p, p.baseLayers + p.wallLayers);
    const { gcode, stats } = buildRecordGcode(p, signal, header, footer);
    writeOut(tpl, gcode, stats.meta);
    if (values.preview) { ensureDir(values.preview); writeWav16(values.preview, playbackPreview(signal, p), p.sampleRate); }
    report("generate", gcode, stats.timeSec,
      `music ${stats.musicSec.toFixed(1)} s / max ${maxDurationSec(p).toFixed(1)} s, ${stats.musicTurns} turns, r_min ${stats.rInnermost.toFixed(1)} mm, path ${(stats.pathLengthMm / 1000).toFixed(0)} m, filament ${(stats.filamentMm / 1000).toFixed(1)} m`);
  } else if (cmd === "matrix") {
    const p = params();
    const rings = matrixRings(p, values.quick ? QUICK_RING_DEFS : undefined);
    const { tpl, header, footer } = headerFooter(p, p.baseLayers + Math.max(...rings.map((r) => r.wallLayers)));
    const { gcode, stats } = buildRingsGcode(p, rings, header, footer);
    writeOut(tpl, gcode, stats.meta);
    const base = values.out!.replace(/\.gcode(\.3mf)?$/, "");
    writeFileSync(`${base}-rings.json`, JSON.stringify(rings, null, 2));
    report("matrix", gcode, stats.timeSec, `${rings.length} rings, table: ${base}-rings.json`);
    console.table(rings.map((r) => ({ r: Number(r.radiusMm.toFixed(1)), Hz: Math.round(r.freqHz), gap: r.grooveGapMm, A: r.amplitudeMm, layers: r.wallLayers, note: r.note })));
  } else if (cmd === "smoke" || cmd === "calib" || cmd === "calib-tones" || cmd === "melody") {
    const p = params();
    const budget = maxDurationSec(p);
    const prog = cmd === "smoke" ? smokeProgram(p.sampleRate, budget) : cmd === "calib" ? calibrationProgram(p.sampleRate, budget) : cmd === "calib-tones" ? calibProgram(p.sampleRate, budget) : melodyProgram(p.sampleRate, budget, values.tune ?? "entertainer");
    prog.segments = withRadii(prog.segments, p);
    const signal = normalizePeak(prepareSignal(prog.signal, withOverrides(p, { highpassHz: 20 }), { trim: false, radiusAtSec: (t) => radiusAtSec(p, t) }), 1);
    const { tpl, header, footer } = headerFooter(p, p.baseLayers + p.wallLayers);
    const { gcode, stats } = buildRecordGcode(p, signal, header, footer);
    writeOut(tpl, gcode, stats.meta);
    const base = values.out!.replace(/\.gcode(\.3mf)?$/, "");
    writeFileSync(`${base}-segments.json`, JSON.stringify(prog.segments, null, 2));
    writeWav16(`${base}-ref.wav`, playbackPreview(signal, p), p.sampleRate);
    report(cmd, gcode, stats.timeSec, `music ${stats.musicSec.toFixed(1)} s, ${stats.musicTurns} turns, segments: ${base}-segments.json`);
  } else if (cmd === "calibrate") {
    // A turntable recording (a WAV from Audacity, any sample rate) plus the tuning disc segments
    // give the correction profile.
    const { samples, sampleRate } = readWav16(positionals[1]);
    const rec = resample(samples, sampleRate, DEFAULT_PARAMS.sampleRate);
    const segments = JSON.parse(readFileSync(values.segments!, "utf8")) as Segment[];
    const p = params();
    // The reference is the sound that SHOULD have come out of the speaker: after the filters and
    // the limiter, but WITHOUT RIAA pre-emphasis, because the phono preamp undoes that anyway.
    // If the reference were the groove content, the RIAA curve would enter the correction as if
    // it were distortion.
    const raw = calibrationProgram(p.sampleRate, segments[segments.length - 1].end + 0.01).signal;
    const refP = withOverrides(p, { highpassHz: 20, riaaPreEmphasis: false });
    const ref = normalizePeak(prepareSignal(raw, refP, { trim: false, radiusAtSec: (t) => radiusAtSec(p, t) }), 1);
    const off = values.offset ? { offsetSec: Number(values.offset), score: 1 } : alignOffset(rec, ref, p.sampleRate);
    console.log(`alignment: the pattern starts ${off.offsetSec.toFixed(2)} s into the recording (match ${off.score.toFixed(2)})`);
    if (off.score < 0.3) console.warn("NOTE: weak match. Check this is a recording of that disc; you can pass --offset by hand.");
    const blocks = measureBlocksAuto(rec, ref, p.sampleRate, segments, off.offsetSec, MULTITONE_FREQS);
    const cal = buildProfile(blocks, MULTITONE_FREQS, { rpm: p.rpm, diameterMm: p.diameterMm, lowpassHz: p.lowpassHz, riaa: p.riaaPreEmphasis }, { maxUsableHz: (r) => trackableHz(p, r) });
    ensureDir(values.out ?? "calibration.json");
    writeFileSync(values.out ?? "calibration.json", JSON.stringify(cal, null, 2));
    console.log(`blocks: ${blocks.length}, turntable speed: ${((cal.speedRatio - 1) * 100).toFixed(2)}% off nominal`);
    console.table(cal.radii.map((r, ri) => Object.fromEntries([["r [mm]", r], ...cal.freqs.map((f, fi) => [`${f} Hz`, `${cal.measuredDb[ri][fi].toFixed(1)} -> ${cal.correctionDb[ri][fi] >= 0 ? "+" : ""}${cal.correctionDb[ri][fi].toFixed(1)}`])])));
    console.log("noise [dB relative to the band median]:", cal.freqs.map((f, i) => `${f}:${cal.noiseDb[i].toFixed(0)}`).join("  "));
    console.log(`written: ${values.out ?? "calibration.json"}`);
  } else if (cmd === "analyze") {
    const { samples, sampleRate } = readWav16(positionals[1]);
    const segments = JSON.parse(readFileSync(values.segments!, "utf8")) as Segment[];
    console.table(analyzeSegments(samples, sampleRate, segments, Number(values.offset ?? 0)));
  } else {
    console.log([
      "usage:",
      "  cli generate <file> --template t.gcode.3mf --out r.gcode.3mf [--preview r.wav] [--start 43 --length 20]",
      "      [--rpm 78 --diameter 250 --amp 0.15 --gap 0 --lowpass 1200 --no-riaa --drive 6 --wall-layers 3 --speed 20]",
      "  cli matrix --template t.gcode.3mf --out matrix.gcode.3mf [--quick]   (--quick: 170 mm, 6 rings, about 1 h)",
      `  cli melody --template t.gcode.3mf --out melody.gcode.3mf [--tune ${TUNES.map((t) => t.id).join("|")}]`,
      "  cli smoke --template t.gcode.3mf --out smoke.gcode.3mf --diameter 200",
      "  cli calib --template t.gcode.3mf --out calib.gcode.3mf [--rpm 45]      (tuning record: multitone blocks)",
      "  cli calibrate recording.wav --segments out/calib-segments.json --out calibration.json [--rpm 45]",
      "  cli generate ... --calibration calibration.json",
      "  cli analyze recording.wav --segments out/calib-segments.json --offset 3.4",
      "",
      "  cli model <file> --out disc.3mf [--rpm 45 --start 43 --amp 0.18 --steps 2400]   a solid you slice yourself",
      "      groove shape: --groove-top 1.6 --groove-floor 0.5 --groove-depth 0.7 --land 0.9 --thickness 2",
      "  cli model-melody --out disc.3mf --tune entertainer                              the same from the tune library",
      "",
      "--color-change inserts a pause before the grooves, for a manual spool swap",
      "--ams-slot N   a real filament change to AMS tool N (1-3) instead of a pause",
      `--decor ${DECOR_STYLES.join("|")}   pattern in the middle of the disc`,
      '--text "FIRST LINE|SECOND" --text-size 7   engraved label text',
      "--presence 6 --compression 8   brightness and compression, against the behind-a-wall sound",
      "--nozzle 0.2   a coherent profile for a fine nozzle (groove, layers, bandwidth)",
      "--gcode-only writes raw .gcode (for an SD card) instead of .gcode.3mf",
      "--no-spaghetti turns the spaghetti detector off, since a disc surface triggers false alarms",
    ].join("\n"));
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
