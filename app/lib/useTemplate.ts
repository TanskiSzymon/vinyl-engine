"use client";
// The printer template is kept in localStorage (about 40 kB), so it only has to be loaded once.
import { useCallback, useEffect, useState } from "react";
import { templateInfo, type TemplateInfo } from "./template-info";

const KEY = "vinyl-engine.template.v1";

export type StoredTemplate = { name: string; bytes: Uint8Array; info: TemplateInfo };

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out;
}

export function useTemplate() {
  const [template, setTemplate] = useState<StoredTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const { name, b64 } = JSON.parse(raw) as { name: string; b64: string };
      const bytes = fromBase64(b64);
      setTemplate({ name, bytes, info: templateInfo(bytes) });
    } catch {
      localStorage.removeItem(KEY);
    }
  }, []);

  const load = useCallback(async (file: File) => {
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const info = templateInfo(bytes);
      setTemplate({ name: file.name, bytes, info });
      try { localStorage.setItem(KEY, JSON.stringify({ name: file.name, b64: toBase64(bytes) })); } catch { /* too large, or private mode */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that template");
    }
  }, []);

  const clear = useCallback(() => {
    setTemplate(null);
    localStorage.removeItem(KEY);
  }, []);

  return { template, error, load, clear };
}
