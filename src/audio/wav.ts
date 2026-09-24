// PCM16 WAV: writing (previews and references) and reading (a turntable recording over USB).
import { readFileSync, writeFileSync } from "node:fs";

export function writeWav16(path: string, samples: Float32Array, fs: number): void {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(fs, 24); h.writeUInt32LE(fs * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}

/** Reads mono or stereo PCM16, averaging stereo to mono. Any other format is an error. */
export function readWav16(path: string): { samples: Float32Array; sampleRate: number } {
  const b = readFileSync(path);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error("Nie WAV");
  let pos = 12, fmt: { channels: number; rate: number; bits: number; format: number } | null = null, data: Buffer | null = null;
  while (pos + 8 <= b.length) {
    const id = b.toString("ascii", pos, pos + 4), size = b.readUInt32LE(pos + 4);
    if (id === "fmt ") fmt = { format: b.readUInt16LE(pos + 8), channels: b.readUInt16LE(pos + 10), rate: b.readUInt32LE(pos + 12), bits: b.readUInt16LE(pos + 22) };
    if (id === "data") data = b.subarray(pos + 8, pos + 8 + size);
    pos += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error("Brak fmt/data");
  if (fmt.format !== 1 || fmt.bits !== 16) throw new Error(`only PCM16 is supported, got format=${fmt.format} bits=${fmt.bits}`);
  const frames = Math.floor(data.length / (2 * fmt.channels));
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    let s = 0;
    for (let c = 0; c < fmt.channels; c += 1) s += data.readInt16LE((i * fmt.channels + c) * 2);
    samples[i] = s / fmt.channels / 32768;
  }
  return { samples, sampleRate: fmt.rate };
}
