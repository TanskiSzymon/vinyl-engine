// Audio decoding IN THE BROWSER: the user's file never leaves their machine. Web Audio handles
// mp4/m4a/mp3/wav/ogg, and video is ignored, since only the audio track is read.

export async function decodeFileToMono(file: File, targetRate: number): Promise<Float32Array> {
  const bytes = await file.arrayBuffer();
  const Ctx: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let buffer: AudioBuffer;
  try {
    buffer = await ctx.decodeAudioData(bytes.slice(0));
  } finally {
    void ctx.close();
  }
  return resampleToMono(buffer, targetRate);
}

/** Mixes the channels to mono through an OfflineAudioContext at the target sample rate. */
export async function resampleToMono(buffer: AudioBuffer, targetRate: number): Promise<Float32Array> {
  const frames = Math.max(1, Math.ceil((buffer.duration * targetRate)));
  const offline = new OfflineAudioContext(1, frames, targetRate);
  const src = offline.createBufferSource();
  if (buffer.numberOfChannels === 1) {
    src.buffer = buffer;
  } else {
    const mono = offline.createBuffer(1, buffer.length, buffer.sampleRate);
    const out = mono.getChannelData(0);
    for (let c = 0; c < buffer.numberOfChannels; c += 1) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i += 1) out[i] += data[i] / buffer.numberOfChannels;
    }
    src.buffer = mono;
  }
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return new Float32Array(rendered.getChannelData(0));
}

/** An in-memory PCM16 WAV, so the preview can be played in the browser without touching disk. */
export function wavBlob(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const ascii = (off: number, s: string) => { for (let i = 0; i < s.length; i += 1) v.setUint8(off + i, s.charCodeAt(i)); };
  ascii(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); ascii(8, "WAVE");
  ascii(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ascii(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  }
  return new Blob([buf], { type: "audio/wav" });
}
