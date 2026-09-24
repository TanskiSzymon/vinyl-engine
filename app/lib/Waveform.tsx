"use client";
// The waveform with the passage that will go on the disc highlighted. Drawn on a canvas from a
// min/max envelope: a three minute track at 8 kHz is about 1.4 million samples, so it is
// aggregated first.
import { useEffect, useRef } from "react";

export function Waveform({ samples, sampleRate, startSec, lengthSec, onSeek }: {
  samples: Float32Array; sampleRate: number; startSec: number; lengthSec: number;
  onSeek?: (sec: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const g = cv.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue("--ink-2").trim() || "#57503f";
    const amber = css.getPropertyValue("--amber").trim() || "#d2601a";
    const total = samples.length / sampleRate;
    const per = Math.max(1, Math.floor(samples.length / w));
    // tlo fali
    for (let x = 0; x < w; x += 1) {
      let mn = 0, mx = 0;
      for (let i = x * per; i < Math.min(samples.length, (x + 1) * per); i += 1) {
        if (samples[i] < mn) mn = samples[i];
        if (samples[i] > mx) mx = samples[i];
      }
      const inSel = (x / w) * total >= startSec && (x / w) * total < startSec + lengthSec;
      g.strokeStyle = inSel ? amber : ink;
      g.globalAlpha = inSel ? 1 : 0.32;
      g.beginPath();
      g.moveTo(x + 0.5, h / 2 - mx * (h / 2 - 2));
      g.lineTo(x + 0.5, h / 2 - mn * (h / 2 - 2));
      g.stroke();
    }
    // ramka zaznaczenia
    g.globalAlpha = 1;
    const x0 = (startSec / total) * w, x1 = ((startSec + lengthSec) / total) * w;
    g.strokeStyle = amber; g.lineWidth = 1.5;
    g.strokeRect(x0, 1, Math.max(2, x1 - x0), h - 2);
  }, [samples, sampleRate, startSec, lengthSec]);

  return (
    <canvas
      ref={ref}
      className="wave"
      onClick={(e) => {
        if (!onSeek || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        onSeek(Math.max(0, ((e.clientX - r.left) / r.width) * (samples.length / sampleRate) - lengthSec / 2));
      }}
      title="Click to choose the passage"
    />
  );
}
