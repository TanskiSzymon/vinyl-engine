import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeToMono } from "./decode";
import { rms } from "./dsp";
import { tone } from "./synth";
import { writeWav16 } from "./wav";

describe("decodeToMono", () => {
  it("decodes a wav via ffmpeg and resamples to 8000 Hz", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dec-"));
    const p = join(dir, "t.wav");
    writeWav16(p, tone(440, 1, 44100, 0.8), 44100);
    const y = await decodeToMono(p, 8000);
    expect(Math.abs(y.length - 8000)).toBeLessThan(100);
    expect(rms(y)).toBeCloseTo(0.8 / Math.SQRT2, 1);
  });
  it("rejects missing file", async () => {
    await expect(decodeToMono("/nonexistent.mp4", 8000)).rejects.toThrow(/ffmpeg/);
  });
});
