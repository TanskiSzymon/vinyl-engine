import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tone } from "./synth";
import { readWav16, writeWav16 } from "./wav";

describe("wav", () => {
  it("roundtrips PCM16 mono", () => {
    const dir = mkdtempSync(join(tmpdir(), "wav-"));
    const p = join(dir, "t.wav");
    const x = tone(1000, 0.1, 8000, 0.5);
    writeWav16(p, x, 8000);
    const { samples, sampleRate } = readWav16(p);
    expect(sampleRate).toBe(8000);
    expect(samples.length).toBe(x.length);
    for (let i = 0; i < 50; i += 1) expect(samples[i]).toBeCloseTo(x[i], 3);
  });
});
