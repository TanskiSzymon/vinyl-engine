// Worker: all geometry and G-code is built off the UI thread (a few hundred thousand points).
import { normalizePeak } from "@/src/audio/dsp";
import { playbackPreview, prepareSignal } from "@/src/audio/prepare";
import { packGcode3mfBytes } from "@/src/gcode/pack3mf";
import { disableSpaghettiDetector, patchLayerCount, patchLevelingArea, patchNozzle, readTemplateBytes, splitGcode, type PrintMeta, type Template } from "@/src/gcode/template";
import { calibrationProgram, matrixRings, melodyProgram, QUICK_RING_DEFS, radiusAtSec, smokeProgram, withRadii } from "@/src/programs";
import { alignOffset, buildProfile, measureBlocksAuto } from "@/src/analysis/calibrate";
import { MULTITONE_FREQS } from "@/src/audio/multitone";
import { buildRecordMesh, MESH_DEFAULTS, meshMaxDurationSec, meshPitchMm, type MeshParams } from "@/src/mesh/record-mesh";
import { write3mf } from "@/src/mesh/write3mf";
import { buildRecordGcode, buildRingsGcode } from "@/src/record/build";
import { DEFAULT_PARAMS, maxDurationSec, trackableHz, validate, withOverrides, type RecordParams } from "@/src/record/layout";
import type { CalibrateRequest, CalibrateResult, WorkerRequest, WorkerResult } from "./types";

/** Without a template the file is preview only: it has no printer start or end G-code. */
const FALLBACK = { header: "; no printer template\nM83\nG90\n", footer: "M104 S0\nM140 S0\nM84\n" };

function headerFooter(tpl: Template | null, p: RecordParams, layers: number, noSpaghetti: boolean) {
  if (!tpl) return FALLBACK;
  const { header, footer } = splitGcode(tpl.gcode);
  let h = patchLevelingArea(patchLayerCount(header, layers), p.centerX, p.centerY, p.diameterMm / 2, p.bedMm);
  h = patchNozzle(h, p.nozzleMm, p.layerHeightMm);
  if (noSpaghetti) h = disableSpaghettiDetector(h);
  return { header: h, footer };
}

function pack(tpl: Template | null, gcode: string, name: string, meta: PrintMeta) {
  return tpl
    ? { fileBytes: packGcode3mfBytes(tpl, gcode, meta), fileName: `${name}.gcode.3mf`, isRaw: false }
    : { fileBytes: new TextEncoder().encode(gcode), fileName: `${name}.gcode`, isRaw: true };
}

/**
 * Model mode: hand back a 3MF solid the user slices themselves. The groove is wider than in
 * G-code mode, because a slicer needs room for its own extrusion paths between the grooves.
 */
function runModel(req: WorkerRequest, p: RecordParams, signal: Float32Array, title: string): WorkerResult {
  const mp: MeshParams = {
    ...MESH_DEFAULTS, sampleRate: p.sampleRate,
    diameterMm: p.diameterMm, holeMm: p.holeMm, rpm: p.rpm,
    outerGrooveR: p.outerGrooveR, innerGrooveR: p.innerGrooveR,
    centerX: 0, centerY: 0,
  };
  const { mesh, turns, musicSec } = buildRecordMesh(mp, signal);
  const bad = mesh.checkManifold(1);
  if (bad.length) throw new Error(`the mesh is not watertight: ${bad[0]}`);
  const bytes = write3mf(mesh, title);
  return {
    fileBytes: bytes, fileName: `${title.replace(/[^\w-]+/g, "-").toLowerCase()}.3mf`, isRaw: false,
    previewWav: playbackPreview(signal, p), sampleRate: p.sampleRate,
    stats: {
      timeSec: 0, filamentMm: 0, pathLengthMm: 0, lines: mesh.triangleCount,
      layers: 0, musicSec, musicTurns: turns, rInnermost: mp.innerGrooveR,
      maxSec: meshMaxDurationSec(mp),
    },
    rings: null, segments: null,
  };
}

function run(req: WorkerRequest): WorkerResult {
  const p: RecordParams = withOverrides(DEFAULT_PARAMS, req.overrides);
  const errors = validate(p);
  if (errors.length) throw new Error(errors.join("; "));
  const tpl = req.templateBytes ? readTemplateBytes(req.templateBytes) : null;

  if (req.mode === "matrix" || req.mode === "quick") {
    const rings = matrixRings(p, req.mode === "quick" ? QUICK_RING_DEFS : undefined);
    const layers = p.baseLayers + Math.max(...rings.map((r) => r.wallLayers));
    const { header, footer } = headerFooter(tpl, p, layers, req.noSpaghetti);
    const { gcode, stats } = buildRingsGcode(p, rings, header, footer);
    return { ...pack(tpl, gcode, req.mode === "quick" ? "matrix-quick" : "matrix", stats.meta), previewWav: null, sampleRate: p.sampleRate, stats, rings, segments: null };
  }

  const layers = p.baseLayers + p.wallLayers;
  const { header, footer } = headerFooter(tpl, p, layers, req.noSpaghetti);
  let signal: Float32Array;
  let segments = null;
  if (req.mode === "music") {
    if (!req.signal) throw new Error("No audio loaded");
    signal = prepareSignal(req.signal, p, { startSec: req.startSec, calibration: req.calibration ?? undefined, radiusAtSec: (t) => radiusAtSec(p, t) });
  } else {
    const budget = maxDurationSec(p);
    const prog = req.mode === "smoke" ? smokeProgram(p.sampleRate, budget) : req.mode === "calib" ? calibrationProgram(p.sampleRate, budget) : melodyProgram(p.sampleRate, budget, req.tuneId);
    signal = normalizePeak(prepareSignal(prog.signal, withOverrides(p, { highpassHz: 20 }), { trim: false, radiusAtSec: (t) => radiusAtSec(p, t) }), 1);
    segments = withRadii(prog.segments, p);
  }
  if (req.format === "model") {
    const title = req.mode === "music" ? "Vinyl-Engine record" : `Vinyl-Engine ${req.mode}`;
    return runModel(req, p, signal, title);
  }
  const { gcode, stats } = buildRecordGcode(p, signal, header, footer);
  return {
    ...pack(tpl, gcode, req.mode === "music" ? "record" : req.mode, stats.meta),
    previewWav: playbackPreview(signal, p),
    sampleRate: p.sampleRate,
    stats: { ...stats, maxSec: maxDurationSec(p) },
    rings: null,
    segments,
  };
}

function calibrate(req: CalibrateRequest): CalibrateResult {
  const p = withOverrides(DEFAULT_PARAMS, req.overrides);
  // The reference carries no RIAA pre-emphasis: the phono preamp undoes it on playback.
  const raw = calibrationProgram(p.sampleRate, req.segments[req.segments.length - 1].end + 0.01).signal;
  const refP = withOverrides(p, { highpassHz: 20, riaaPreEmphasis: false });
  const ref = normalizePeak(prepareSignal(raw, refP, { trim: false, radiusAtSec: (t) => radiusAtSec(p, t) }), 1);
  const off = alignOffset(req.recording, ref, p.sampleRate);
  if (off.score < 0.25) throw new Error(`Could not find the pattern in the recording (match ${off.score.toFixed(2)}). Is this a recording of that disc? Start recording before you drop the needle.`);
  const blocks = measureBlocksAuto(req.recording, ref, p.sampleRate, req.segments, off.offsetSec, MULTITONE_FREQS);
  const profile = buildProfile(blocks, MULTITONE_FREQS, { rpm: p.rpm, diameterMm: p.diameterMm, lowpassHz: p.lowpassHz, riaa: p.riaaPreEmphasis }, { maxUsableHz: (r) => trackableHz(p, r) });
  return { profile, offsetSec: off.offsetSec, score: off.score, blocks: blocks.length };
}

self.onmessage = (e: MessageEvent<WorkerRequest | CalibrateRequest>) => {
  try {
    if ("kind" in e.data && e.data.kind === "calibrate") self.postMessage({ ok: true, calibration: calibrate(e.data) });
    else self.postMessage({ ok: true, result: run(e.data as WorkerRequest) });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
