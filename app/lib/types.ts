import type { RecordParams } from "@/src/record/layout";
import type { Ring } from "@/src/gcode/rings";
import type { Segment } from "@/src/programs";
import type { CalibrationProfile } from "@/src/analysis/calibrate";

export type Mode = "melody" | "music" | "quick" | "matrix" | "smoke" | "calib";

export type WorkerRequest = {
  mode: Mode;
  templateBytes: Uint8Array | null;
  signal: Float32Array | null;      // only for mode === "music"
  overrides: Partial<RecordParams>;
  noSpaghetti: boolean;
  startSec: number;
  tuneId: string;
  format: "gcode" | "model";
  calibration: CalibrationProfile | null;
};

export type CalibrateRequest = {
  kind: "calibrate";
  recording: Float32Array;   // the turntable recording, already mono at 8 kHz
  segments: Segment[];       // the segments of the tuning record that was printed
  overrides: Partial<RecordParams>;
};

export type CalibrateResult = { profile: CalibrationProfile; offsetSec: number; score: number; blocks: number };

export type WorkerResult = {
  fileBytes: Uint8Array;
  fileName: string;
  isRaw: boolean;                   // true = raw .gcode, because no template was given
  previewWav: Float32Array | null;
  sampleRate: number;
  stats: {
    timeSec: number; filamentMm: number; pathLengthMm: number; lines: number;
    layers: number; musicSec?: number; musicTurns?: number; rInnermost?: number; maxSec?: number;
  };
  rings: Ring[] | null;
  segments: Segment[] | null;
};

export type WorkerMessage =
  | { ok: true; result: WorkerResult }
  | { ok: true; calibration: CalibrateResult }
  | { ok: false; error: string };
