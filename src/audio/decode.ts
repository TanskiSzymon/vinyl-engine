// Decoding any container (mp4/mp3/wav/...) to mono float32 through ffmpeg.
// Video is ignored (-vn). The binary can be pointed at with the FFMPEG environment variable.
import { spawn } from "node:child_process";

export function decodeToMono(inputPath: string, sampleRate: number, ffmpegBin = process.env.FFMPEG ?? "ffmpeg"): Promise<Float32Array> {
  const args = ["-v", "error", "-i", inputPath, "-vn", "-ac", "1", "-ar", String(sampleRate), "-f", "f32le", "-"];
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegBin, args);
    const chunks: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (c: Buffer) => chunks.push(c));
    p.stderr.on("data", (c: Buffer) => { err += c.toString(); });
    p.on("error", (e) => reject(new Error(`ffmpeg: ${e.message}`)));
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exit ${code}: ${err.trim()}`));
      const raw = Buffer.concat(chunks);
      const copy = new Uint8Array(raw.byteLength);
      copy.set(raw);
      resolve(new Float32Array(copy.buffer, 0, Math.floor(copy.byteLength / 4)));
    });
  });
}
