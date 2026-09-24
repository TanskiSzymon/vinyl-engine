"use client";
// Work in progress survives a reload: the settings go to localStorage and the decoded audio (a
// few MB) to IndexedDB. Without it a refresh would throw away the file that was just loaded and
// the passage that was just chosen.
const DB = "vinyl-engine", STORE = "draft", KEY = "audio";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function saveAudioDraft(name: string, samples: Float32Array): Promise<void> {
  try {
    const db = await open();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ name, samples }, KEY);
      tx.oncomplete = () => res(null);
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch { /* private mode or no quota left, nothing to be done */ }
}

export async function loadAudioDraft(): Promise<{ name: string; samples: Float32Array } | null> {
  try {
    const db = await open();
    const out = await new Promise<{ name: string; samples: Float32Array } | null>((res) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => res(req.result ?? null);
      req.onerror = () => res(null);
    });
    db.close();
    return out;
  } catch { return null; }
}

export async function clearAudioDraft(): Promise<void> {
  try {
    const db = await open();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    db.close();
  } catch { /* nic */ }
}

export function saveSettings(s: Record<string, unknown>): void {
  try { localStorage.setItem("vinyl-engine.draft.v1", JSON.stringify(s)); } catch { /* nic */ }
}

export function loadSettings(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem("vinyl-engine.draft.v1");
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch { return null; }
}
