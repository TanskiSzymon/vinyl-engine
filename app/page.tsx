"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Drop } from "./lib/Drop";
import { DecorSwatch, VinylDisc } from "./lib/VinylDisc";
import type { DecorStyle } from "@/src/gcode/decor";
import { Waveform } from "./lib/Waveform";
import { decodeFileToMono, wavBlob } from "./lib/decode-browser";
import { useTemplate } from "./lib/useTemplate";
import type { CalibrateResult, Mode, WorkerMessage, WorkerResult } from "./lib/types";
import type { CalibrationProfile } from "@/src/analysis/calibrate";
import type { Segment } from "@/src/programs";
import { resample } from "@/src/audio/resample";
import { TUNES } from "@/src/audio/melody";
import { bandwidth, DEFAULT_PARAMS, maxDurationSec, pitchMm, withOverrides } from "@/src/record/layout";
import Link from "next/link";
import { useText } from "./lib/text";
import { clearAudioDraft, loadAudioDraft, loadSettings, saveAudioDraft, saveSettings } from "./lib/draft";

const REPO = "https://github.com/TanskiSzymon/vinyl-engine";

const MODE_IDS: { id: Mode; side: string; label: "modeMelody" | "modeMusic" | "modeCalib" | "modeRings"; sub: "modeMelodySub" | "modeMusicSub" | "modeCalibSub" | "modeRingsSub" }[] = [
  { id: "melody", side: "A1", label: "modeMelody", sub: "modeMelodySub" },
  { id: "music", side: "A2", label: "modeMusic", sub: "modeMusicSub" },
  { id: "calib", side: "B1", label: "modeCalib", sub: "modeCalibSub" },
  { id: "quick", side: "B2", label: "modeRings", sub: "modeRingsSub" },
];

const DECOR_OPTIONS: { id: DecorStyle; label: "decorRings" | "decorSpiral" | "decorSunburst" | "decorStar" | "decorRosette" | "decorWaves" | "decorGuilloche" | "decorNone" }[] = [
  { id: "rings", label: "decorRings" }, { id: "spiral", label: "decorSpiral" },
  { id: "sunburst", label: "decorSunburst" }, { id: "star", label: "decorStar" },
  { id: "rosette", label: "decorRosette" }, { id: "waves", label: "decorWaves" },
  { id: "guilloche", label: "decorGuilloche" }, { id: "none", label: "decorNone" },
];

const fmtTime = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : `${Math.round(s / 60)} min`);
const fmtSize = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} kB`);

export default function Page() {
  const t = useText();
  const [restored, setRestored] = useState(false);
  const { template, error: tplError, load: loadTemplate, clear: clearTemplate } = useTemplate();
  const [mode, setMode] = useState<Mode>("melody");
  const [audioName, setAudioName] = useState<string | null>(null);
  const [signal, setSignal] = useState<Float32Array | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WorkerResult | null>(null);

  const [diameter, setDiameter] = useState(250);
  const [rpm, setRpm] = useState(45);
  const [amp, setAmp] = useState(DEFAULT_PARAMS.amplitudeMm);
  const [gap, setGap] = useState(DEFAULT_PARAMS.grooveGapMm);
  const [wallLayers, setWallLayers] = useState(DEFAULT_PARAMS.wallLayers);
  const [lowpass, setLowpass] = useState(DEFAULT_PARAMS.lowpassHz);
  const [drive, setDrive] = useState(6);
  const [presence, setPresence] = useState(DEFAULT_PARAMS.presenceDb);
  const [compression, setCompression] = useState(DEFAULT_PARAMS.compressionDb);
  const [riaa, setRiaa] = useState(true);
  const [noSpaghetti, setNoSpaghetti] = useState(true);
  const [startSec, setStartSec] = useState(0);
  const [hole, setHole] = useState(DEFAULT_PARAMS.holeMm);
  const [colorChange, setColorChange] = useState(false);
  const [amsSlot, setAmsSlot] = useState(0);
  const [decorStyle, setDecorStyle] = useState<DecorStyle>("rings");
  const [showText, setShowText] = useState(false);
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [textSize, setTextSize] = useState(7);
  const [tuneId, setTuneId] = useState("entertainer");
  const [format, setFormat] = useState<"gcode" | "model">("gcode");

  const [calibration, setCalibration] = useState<CalibrationProfile | null>(null);
  const [useCalibration, setUseCalibration] = useState(true);
  const [calibInfo, setCalibInfo] = useState<string | null>(null);
  const [calibSegments, setCalibSegments] = useState<{ segments: Segment[]; overrides: Record<string, unknown> } | null>(null);

  useEffect(() => {
    try {
      const c = localStorage.getItem("vinyl-engine.calibration.v1");
      if (c) setCalibration(JSON.parse(c) as CalibrationProfile);
      const sgm = localStorage.getItem("vinyl-engine.calib-disc.v1");
      if (sgm) setCalibSegments(JSON.parse(sgm));
    } catch { /* missing or damaged */ }
  }, []);

  // Work in progress: settings and the decoded audio survive a reload.
  useEffect(() => {
    const d = loadSettings();
    if (d) {
      if (typeof d.mode === "string") setMode(d.mode as Mode);
      if (typeof d.diameter === "number") setDiameter(d.diameter);
      if (typeof d.rpm === "number") setRpm(d.rpm);
      if (typeof d.startSec === "number") setStartSec(d.startSec);
      if (typeof d.decorStyle === "string") setDecorStyle(d.decorStyle as DecorStyle);
      if (typeof d.colorChange === "boolean") setColorChange(d.colorChange);
      if (typeof d.amsSlot === "number") setAmsSlot(d.amsSlot);
      if (typeof d.showText === "boolean") setShowText(d.showText);
      if (typeof d.line1 === "string") setLine1(d.line1);
      if (typeof d.line2 === "string") setLine2(d.line2);
      if (typeof d.textSize === "number") setTextSize(d.textSize);
      setRestored(true);
    }
    loadAudioDraft().then((a) => { if (a) { setSignal(a.samples); setAudioName(a.name); setRestored(true); } });
  }, []);

  const worker = useRef<Worker | null>(null);
  // Generating happens in the browser and eats a few hundred MB, which usually fails on a phone.
  const [onPhone, setOnPhone] = useState(false);
  useEffect(() => { setOnPhone(/Android|iPhone|iPad/i.test(navigator.userAgent)); }, []);

  useEffect(() => {
    worker.current = new Worker(new URL("./lib/generate.worker.ts", import.meta.url));
    return () => worker.current?.terminate();
  }, []);

  const params = useMemo(() => {
    const quick = mode === "quick";
    const d = quick ? 170 : diameter;
    return {
      diameterMm: d, outerGrooveR: d / 2 - 3, rpm, amplitudeMm: amp, grooveGapMm: gap, wallLayers,
      lowpassHz: lowpass, driveDb: drive, riaaPreEmphasis: riaa, holeMm: hole,
      presenceDb: presence, compressionDb: compression, colorChange, amsSlot, decorStyle,
      labelText: showText ? [line1, line2] : [], labelTextHeightMm: textSize,
      landMinMm: Math.max(DEFAULT_PARAMS.landMinMm, 2 * amp + 2 * (wallLayers - 1) * DEFAULT_PARAMS.wallStepMm + 0.3),
      ...(quick ? { baseLayers: 5 } : {}),
    };
  }, [mode, diameter, rpm, amp, gap, wallLayers, lowpass, drive, riaa, hole, colorChange, amsSlot, decorStyle, showText, line1, line2, textSize, presence, compression]);

  useEffect(() => {
    saveSettings({ mode, diameter, rpm, startSec, decorStyle, colorChange, amsSlot, showText, line1, line2, textSize });
  }, [mode, diameter, rpm, startSec, decorStyle, colorChange, amsSlot, showText, line1, line2, textSize]);

  const geom = useMemo(() => {
    const p = withOverrides(DEFAULT_PARAMS, params);
    try { return { p, capacity: maxDurationSec(p), pitch: pitchMm(p), band: bandwidth(p) }; }
    catch { return { p, capacity: 0, pitch: 1.85, band: { outer: 0, inner: 0 } }; }
  }, [params]);

  const downloadUrl = useMemo(() => (result ? URL.createObjectURL(new Blob([result.fileBytes as BlobPart], { type: "application/octet-stream" })) : null), [result]);
  useEffect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);
  const previewUrl = useMemo(() => (result?.previewWav ? URL.createObjectURL(wavBlob(result.previewWav, result.sampleRate)) : null), [result]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const onAudio = useCallback(async (file: File) => {
    setError(null); setResult(null); setBusy(t("decoding"));
    try {
      const samples = await decodeFileToMono(file, DEFAULT_PARAMS.sampleRate);
      setSignal(samples); setAudioName(file.name); setMode("music"); setStartSec(0);
      void saveAudioDraft(file.name, samples);
    } catch {
      setError(t("errDecode"));
    } finally { setBusy(null); }
  }, [t]);

  const generate = useCallback(() => {
    if (!worker.current) return;
    setError(null); setResult(null); setBusy(t("generating"));
    const w = worker.current;
    w.onmessage = (e: MessageEvent<WorkerMessage>) => {
      setBusy(null);
      if (!e.data.ok) { setError(e.data.error); return; }
      if (!("result" in e.data)) return;
      setResult(e.data.result);
      if (mode === "calib" && e.data.result.segments) {
        const disc = { segments: e.data.result.segments, overrides: params };
        setCalibSegments(disc);
        try { localStorage.setItem("vinyl-engine.calib-disc.v1", JSON.stringify(disc)); } catch { /* ignore */ }
      }
    };
    w.postMessage({
      mode, templateBytes: template?.bytes ?? null, signal: mode === "music" ? signal : null,
      overrides: params, noSpaghetti, startSec, tuneId, format,
      calibration: mode === "music" && useCalibration ? calibration : null,
    });
  }, [mode, template, signal, params, noSpaghetti, startSec, calibration, useCalibration, tuneId, format, t]);

  const onRecording = useCallback(async (file: File) => {
    if (!worker.current || !calibSegments) return;
    setError(null); setCalibInfo(null); setBusy(t("listening"));
    try {
      const raw = await decodeFileToMono(file, 44100);
      const rec = resample(raw, 44100, DEFAULT_PARAMS.sampleRate);
      const w = worker.current;
      w.onmessage = (e: MessageEvent<WorkerMessage>) => {
        setBusy(null);
        if (!e.data.ok) { setError(e.data.error); return; }
        if (!("calibration" in e.data)) return;
        const c: CalibrateResult = e.data.calibration;
        setCalibration(c.profile);
        setCalibInfo(t("calibResult", { sec: c.offsetSec.toFixed(1), blocks: c.blocks, pct: ((c.profile.speedRatio - 1) * 100).toFixed(1) }));
        try { localStorage.setItem("vinyl-engine.calibration.v1", JSON.stringify(c.profile)); } catch { /* ignore */ }
      };
      w.postMessage({ kind: "calibrate", recording: rec, segments: calibSegments.segments, overrides: calibSegments.overrides });
    } catch {
      setBusy(null); setError(t("errDecodeRec"));
    }
  }, [calibSegments, t]);

  const canGenerate = !busy && (format === "model" || !!template) && (mode !== "music" || signal !== null);
  const audioLen = signal ? signal.length / DEFAULT_PARAMS.sampleRate : 0;

  return (
    <main>
      <div className="beta">
        <b>{t("safetyTitle")}</b>
        <span>{t("safetyBody")}</span>
      </div>

      <header className="masthead">
        <VinylDisc
          diameterMm={geom.p.diameterMm} outerR={geom.p.outerGrooveR} innerR={geom.p.innerGrooveR}
          pitchMm={geom.pitch} spinning={!!busy} size={260}
          decorStyle={decorStyle} twoColor={colorChange} holeMm={hole}
          textLines={showText ? [line1, line2] : []} textHeightMm={textSize}
        />
        <div className="copy">
          <h1 className="wordmark">Vinyl<em>·</em>Engine</h1>
          <div className="rule" />
          <p className="tagline">
            {t("tagline")}
          </p>
          <div className="row" style={{ marginBottom: 12 }}>
            <Link href="/how-it-works"><button>{t("howItWorks")}</button></Link>
          </div>
          <div className="badges">
            <span className="badge">{t("badgeNozzle")}</span>
            <span className="badge">{rpm} {t("badgeRpm")}</span>
            <span className="badge">{t("badgeBrowser")}</span>
          </div>
        </div>
      </header>

      <section>
        <div className="step">
          <span className="no">01</span><b>{t("step1")}</b>
          <span>{template ? "" : t("step1Hint")}</span>
          {template && <span className="done">{t("step1Done")}</span>}
        </div>
        {template ? (
          <div className="row">
            <span className="badge">{template.info.printer}</span>
            <span className="badge">{t("step1Nozzle")} {template.info.nozzleMm ?? "?"} mm</span>
            <span className="badge">{t("step1Layer")} {template.info.layerMm ?? "?"} mm</span>
            <span className="badge">{template.info.filament}</span>
            <button className="ghost" onClick={clearTemplate}>{t("step1Change")}</button>
          </div>
        ) : (
          <Drop accept=".3mf" onFile={loadTemplate}>
            {t("step1Drop")}
          </Drop>
        )}
        {template?.info.warnings.map((w) => <p className="warn" key={w}>{w}</p>)}
        {tplError && <p className="err">{tplError}</p>}
        {!template && (
          <details style={{ marginTop: 14 }}>
            <summary>{t("step1How")}</summary>
            <p className="note">
              {t("step1HowBody")}
            </p>
          </details>
        )}
      </section>

      <section>
        <div className="step"><span className="no">02</span><b>{t("step2")}</b></div>
        {restored && <p className="ok" style={{ marginTop: 0 }}>{t("draftRestored")}</p>}
        <div className="tracks">
          {MODE_IDS.map((m) => (
            <button key={m.id} className="track" aria-pressed={mode === m.id} onClick={() => { setMode(m.id); setResult(null); }}>
              <div className="track-no">SIDE {m.side}</div>
              <div className="track-name">{t(m.label)}</div>
              <div className="track-sub">{t(m.sub)}</div>
            </button>
          ))}
        </div>

        {mode === "melody" && (
          <div style={{ marginTop: 16 }}>
            <label>{t("tune")}</label>
            <select value={tuneId} onChange={(e) => { setTuneId(e.target.value); setResult(null); }}>
              {TUNES.map((tu) => <option key={tu.id} value={tu.id}>{tu.title} ({tu.note})</option>)}
            </select>
            <p className="note">{t("tuneNote")}</p>
          </div>
        )}

        {mode === "music" && (
          <div style={{ marginTop: 16 }}>
            <Drop accept="audio/*,video/*" onFile={onAudio}>
              {audioName ? <>{t("loaded")}: <b>{audioName}</b> {t("dropOther")}</> : <>{t("dropAudio")}</>}
            </Drop>
            {signal && (
              <>
                <div style={{ marginTop: 12 }}>
                  <Waveform samples={signal} sampleRate={DEFAULT_PARAMS.sampleRate} startSec={startSec} lengthSec={geom.capacity} onSeek={(s) => setStartSec(Math.round(Math.min(s, Math.max(0, audioLen - geom.capacity))))} />
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <div style={{ width: 150 }}>
                    <label>{t("startSec")}</label>
                    <input type="number" value={startSec} min={0} max={Math.max(0, Math.floor(audioLen - geom.capacity))} step={1} onChange={(e) => setStartSec(Number(e.target.value))} />
                  </div>
                  <p className="note" style={{ margin: 0, flex: 1 }}>
                    {t("trackLen", { len: audioLen.toFixed(0), cap: geom.capacity.toFixed(0), from: startSec, to: Math.round(startSec + geom.capacity) })}
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="step"><span className="no">03</span><b>{t("step3")}</b><span>{t("step3Hint")}</span></div>
        <div className="grid">
          <div>
            <label>{t("diameter")}</label>
            <select value={mode === "quick" ? 170 : diameter} disabled={mode === "quick"} onChange={(e) => setDiameter(Number(e.target.value))}>
              <option value={250}>{t("diameter250")}</option>
              <option value={200}>{t("diameter200")}</option>
              <option value={170}>{t("diameter170")}</option>
            </select>
          </div>
          <div>
            <label>{t("speed")}</label>
            <select value={rpm} onChange={(e) => setRpm(Number(e.target.value))}>
              <option value={78}>{t("speedBrightest")}: {maxDurationSec(withOverrides(DEFAULT_PARAMS, { rpm: 78, diameterMm: diameter, outerGrooveR: diameter / 2 - 2 })).toFixed(0)} s</option>
              <option value={45}>{t("speedBalanced")}: {maxDurationSec(withOverrides(DEFAULT_PARAMS, { rpm: 45, diameterMm: diameter, outerGrooveR: diameter / 2 - 2 })).toFixed(0)} s</option>
              <option value={33.3}>{t("speedLongest")}</option>
            </select>
          </div>
          <div>
            <label>{t("outputFormat")}</label>
            <select value={format} onChange={(e) => { setFormat(e.target.value as typeof format); setResult(null); }}>
              <option value="gcode">{t("formatGcode")}</option>
              <option value="model">{t("formatModel")}</option>
            </select>
          </div>
          <div>
            <label>{t("hole")}</label>
            <input type="number" value={hole} min={6} max={10} step={0.1} onChange={(e) => setHole(Number(e.target.value))} />
          </div>
        </div>

        {format === "model" && <p className="note">{t("formatModelNote")}</p>}

        <div className="row" style={{ marginTop: 16 }}>
          <label className="check">
            <input type="checkbox" checked={colorChange} disabled={format === "model"} onChange={(e) => setColorChange(e.target.checked)} />
            <b>{t("twoColour")}</b>: {t("twoColourSub")}
          </label>
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <label className="check">
            <input type="checkbox" checked={showText} onChange={(e) => setShowText(e.target.checked)} />
            <b>{t("labelText")}</b>: {t("labelTextSub")}
          </label>
        </div>
        {showText && (
          <div className="grid" style={{ marginTop: 10 }}>
            <div><label>{t("line1")}</label><input type="text" value={line1} maxLength={22} placeholder="THE ENTERTAINER" onChange={(e) => setLine1(e.target.value)} /></div>
            <div><label>{t("line2")}</label><input type="text" value={line2} maxLength={22} placeholder="SCOTT JOPLIN 1902" onChange={(e) => setLine2(e.target.value)} /></div>
            <div><label>{t("letterHeight")}</label><input type="number" value={textSize} min={4} max={14} step={0.5} onChange={(e) => setTextSize(Number(e.target.value))} /></div>
          </div>
        )}
        {showText && <p className="note">{t("textNote")}</p>}

        {colorChange && (
          <div className="grid" style={{ marginTop: 12 }}>
            <div>
              <label>{t("howColour")}</label>
              <select value={amsSlot} onChange={(e) => setAmsSlot(Number(e.target.value))}>
                <option value={0}>{t("pauseOption")}</option>
                <option value={1}>{t("amsOption")} 2</option>
                <option value={2}>{t("amsOption")} 3</option>
                <option value={3}>{t("amsOption")} 4</option>
              </select>
            </div>
          </div>
        )}
        <div style={{ marginTop: 18 }}>
          <label>{t("decor")}</label>
          <div className="swatches">
            {DECOR_OPTIONS.map((d) => (
              <button key={d.id} className="swatch" aria-pressed={decorStyle === d.id} onClick={() => setDecorStyle(d.id)}>
                <DecorSwatch style={d.id} twoColor={colorChange} />
                <span>{t(d.label)}</span>
              </button>
            ))}
          </div>
        </div>

        {colorChange && <p className="note">{amsSlot === 0 ? t("pauseNote") : t("amsNote")}</p>}

        <div className="deck" style={{ marginTop: 18 }}>
          <div className="disc">
            <VinylDisc diameterMm={geom.p.diameterMm} outerR={geom.p.outerGrooveR} innerR={geom.p.innerGrooveR} pitchMm={geom.pitch} size={340} decorStyle={decorStyle} twoColor={colorChange} holeMm={hole} textLines={showText ? [line1, line2] : []} textHeightMm={textSize} />
          </div>
          <div className="facts">
            <div className="stats">
              <div className="stat"><b>{geom.capacity.toFixed(0)} s</b><span>{t("fits")}</span></div>
              <div className="stat"><b>{Math.floor((geom.p.outerGrooveR - geom.p.innerGrooveR) / geom.pitch)}</b><span>{t("turns")}</span></div>
              <div className="stat"><b>{geom.band.outer} to {geom.band.inner}</b><span>{t("band")}</span></div>
              <div className="stat"><b>{((geom.p.baseLayers + geom.p.wallLayers) * geom.p.layerHeightMm).toFixed(1)} mm</b><span>{t("thickness")}</span></div>
            </div>
            <details>
              <summary>{t("advanced")}</summary>
              <div className="grid" style={{ marginTop: 10 }}>
                <div><label>{t("amplitude")}</label><input type="number" value={amp} min={0.03} max={0.4} step={0.01} onChange={(e) => setAmp(Number(e.target.value))} /></div>
                <div><label>{t("grooveFloor")}</label><input type="number" value={gap} min={0} max={0.4} step={0.05} onChange={(e) => setGap(Number(e.target.value))} /></div>
                <div><label>{t("wallLayers")}</label>
                  <select value={wallLayers} onChange={(e) => setWallLayers(Number(e.target.value))}>
                    {[2, 3, 4].map((n) => (
                      <option key={n} value={n}>{t("wallLayerOption", { n, mm: (n * DEFAULT_PARAMS.layerHeightMm).toFixed(1) })}</option>
                    ))}
                  </select>
                </div>
                <div><label>{t("filter")}</label><input type="number" value={lowpass} min={300} max={3000} step={10} onChange={(e) => setLowpass(Number(e.target.value))} /></div>
                <div><label>{t("driveLabel")}</label><input type="number" value={drive} min={0} max={18} step={1} onChange={(e) => setDrive(Number(e.target.value))} /></div>
                <div><label>{t("presence")}</label><input type="number" value={presence} min={0} max={14} step={1} onChange={(e) => setPresence(Number(e.target.value))} /></div>
                <div><label>{t("compression")}</label><input type="number" value={compression} min={0} max={16} step={1} onChange={(e) => setCompression(Number(e.target.value))} /></div>
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <label className="check"><input type="checkbox" checked={riaa} onChange={(e) => setRiaa(e.target.checked)} /> {t("riaa")}</label>
                <label className="check"><input type="checkbox" checked={noSpaghetti} onChange={(e) => setNoSpaghetti(e.target.checked)} /> {t("spaghetti")}</label>
                {calibration && <label className="check"><input type="checkbox" checked={useCalibration} onChange={(e) => setUseCalibration(e.target.checked)} /> {t("useCalib")}</label>}
              </div>
            </details>
          </div>
        </div>
      </section>

      <section>
        <div className="step"><span className="no">04</span><b>{t("step4")}</b></div>
        {onPhone && <p className="warn">{t("phoneWarn")}</p>}
        <div className="row">
          <button className="primary" disabled={!canGenerate} onClick={generate}>{busy ?? t("generate")}</button>
          {!template && format === "gcode" && <span className="note">{t("needProfile")}</span>}
          {mode === "music" && !signal && template && <span className="note">{t("needAudio")}</span>}
          {calibration && mode === "music" && useCalibration && <span className="ok">{t("withCalibration")}</span>}
        </div>
        {error && (
          <div>
            <p className="err">{t("errGeneric")}</p>
            <p className="note">{t("errReport")}</p>
            <details><summary>{t("errDetails")}</summary><p className="note" style={{ fontFamily: "ui-monospace, monospace" }}>{error}</p></details>
          </div>
        )}

        {result && (
          <div style={{ marginTop: 20 }}>
            <div className="stats">
              {format === "gcode" ? (
                <>
                  <div className="stat"><b>{fmtTime(result.stats.timeSec)}</b><span>{t("printTime")}</span></div>
                  <div className="stat"><b>{(result.stats.filamentMm / 1000).toFixed(1)} m</b><span>{t("filament")}</span></div>
                  <div className="stat"><b>{result.stats.layers}</b><span>{t("layers")}</span></div>
                </>
              ) : (
                <div className="stat"><b>{(result.stats.lines / 1000).toFixed(0)}k</b><span>{t("triangles")}</span></div>
              )}
              <div className="stat"><b>{fmtSize(result.fileBytes.length)}</b><span>{t("file")}</span></div>
              {result.stats.musicSec !== undefined && <div className="stat"><b>{result.stats.musicSec.toFixed(0)} s</b><span>{t("sound")}</span></div>}
              {result.stats.rInnermost !== undefined && <div className="stat"><b>{result.stats.rInnermost.toFixed(0)} mm</b><span>{t("grooveEnd")}</span></div>}
            </div>
            <div className="row">
              <a href={downloadUrl ?? "#"} download={result.fileName}><button className="primary">{t("download")} {result.fileName}</button></a>
              {result.isRaw && <span className="warn">{t("rawWarn")}</span>}
            </div>
            {result.stats.rInnermost !== undefined && result.stats.rInnermost < 62 && (
              <p className="warn">{t("grooveWarn", { r: result.stats.rInnermost.toFixed(0) })}</p>
            )}
            {previewUrl && (
              <>
                <p className="note">{t("previewNote")}</p>
                <audio controls src={previewUrl} />
              </>
            )}
            {result.rings && (
              <div className="scroll">
                <table>
                  <thead><tr><th className="num">{t("thRadius")}</th><th className="num">{t("thTone")}</th><th className="num">{t("thFloor")}</th><th className="num">{t("thAmp")}</th><th className="num">{t("thLayers")}</th><th>{t("thVariant")}</th></tr></thead>
                  <tbody>{result.rings.map((r, i) => (
                    <tr key={i}><td className="num">{r.radiusMm.toFixed(1)}</td><td className="num">{Math.round(r.freqHz)} Hz</td><td className="num">{r.grooveGapMm}</td><td className="num">{r.amplitudeMm}</td><td className="num">{r.wallLayers}</td><td>{r.note}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <section className={calibration ? "" : "muted"}>
        <div className="step">
          <span className="no">05</span><b>{t("step5")}</b>
          <span>{t("step5Hint")}</span>
          {calibration && <span className="done">{t("step1Done")}</span>}
        </div>
        <p className="note" style={{ marginTop: 0 }}>
          {t("calibIntro")}
        </p>
        {calibSegments ? (
          <Drop accept="audio/*" onFile={onRecording}>{t("calibDrop")}</Drop>
        ) : (
          <p className="note">{t("calibFirst")}</p>
        )}
        {calibInfo && <p className="ok">{calibInfo}</p>}
        {calibration && (
          <>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="badge">{t("calibMade")} {new Date(calibration.madeAt).toISOString().slice(0, 10)}</span>
              <span className="badge">{calibration.source.rpm} {t("badgeRpm")}</span>
              <button className="ghost" onClick={() => { setCalibration(null); localStorage.removeItem("vinyl-engine.calibration.v1"); }}>{t("calibRemove")}</button>
            </div>
            <div className="scroll">
              <table>
                <thead><tr><th>{t("thRadius")}</th>{calibration.freqs.map((f) => <th key={f} className="num">{f} Hz</th>)}</tr></thead>
                <tbody>
                  {calibration.radii.map((r, ri) => (
                    <tr key={r}><td>{r} mm</td>{calibration.freqs.map((f, fi) => (
                      <td key={f} className="num">{calibration.measuredDb[ri][fi].toFixed(1)} → {calibration.correctionDb[ri][fi] >= 0 ? "+" : ""}{calibration.correctionDb[ri][fi].toFixed(1)}</td>
                    ))}</tr>
                  ))}
                  <tr><td>{t("thNoise")}</td>{calibration.noiseDb.map((n, i) => <td key={i} className="num">{n.toFixed(0)}</td>)}</tr>
                </tbody>
              </table>
            </div>
            <p className="note">{t("calibFooter")}</p>
          </>
        )}
      </section>

      <footer>
        <div><b>{t("footPlay")}</b> {rpm} {t("badgeRpm")}, {t("footPlayBody")}</div>
        <div><b>{t("footHonest")}</b> {geom.band.outer} Hz → {geom.band.inner} Hz.</div>
        <div><b>{t("footPrivacy")}</b> {t("footPrivacyBody")}</div>
        <div className="row">
          <Link href="/how-it-works">{t("howItWorks")}</Link>
          <a href={REPO} target="_blank" rel="noreferrer">{t("source")}</a>
          <button className="ghost" onClick={() => { clearAudioDraft(); location.reload(); }}>Reset</button>
        </div>
      </footer>
    </main>
  );
}
