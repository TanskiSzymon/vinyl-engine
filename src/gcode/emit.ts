// The G-code emitter: relative extrusion (M83), with E computed from bead width and layer
// height. Simplification: a point is skipped when it lies within tolerance of the segment
// between the last emitted point and the next one. Silence in the audio is an almost perfect
// arc, so this removes most of the lines in the file.
import type { PathPoint, Pt } from "../record/groove";

export type WriterOpts = {
  filamentDiameterMm: number; layerHeightMm: number; retractMm: number;
  retractSpeedMmS: number; travelSpeedMmS: number; simplifyTolMm: number; zHopMm: number;
};

// The simplification tolerance varies: the base is a flat floor (0.03 mm changes nothing there
// and shrinks the file several times over), while the grooves need full accuracy (0.004 mm).

export function extrusionPerMm(widthMm: number, layerMm: number, filamentMm: number): number {
  return (widthMm * layerMm) / ((Math.PI * filamentMm * filamentMm) / 4);
}

const f3 = (v: number) => v.toFixed(3).replace(/\.?0+$/, "");
const f5 = (v: number) => v.toFixed(5).replace(/\.?0+$/, "");

export class GcodeWriter {
  private lines: string[] = [];
  private cur: Pt | null = null;
  private z = 0;
  private layerH: number;
  private lastF = -1;
  private retracted = false;
  private pathLengthMm = 0;
  private filamentMm = 0;
  private timeSec = 0;
  private layerNo = 0;
  private zReached = false;   // whether the nozzle has descended to this layer's Z yet
  private totalLayers = 0;
  private layerMarks: { line: number; timeSec: number }[] = [];

  private tol: number;

  constructor(private readonly o: WriterOpts) { this.layerH = o.layerHeightMm; this.tol = o.simplifyTolMm; }

  /** Sets the simplification tolerance for the paths that follow. */
  setSimplifyTol(t: number): void { this.tol = t; }

  comment(s: string): void { this.lines.push(`; ${s}`); }
  raw(s: string): void { this.lines.push(s); }
  setLayerHeight(h: number): void { this.layerH = h; }

  /** Total layer count, needed for the layer counter and progress bar on the printer screen. */
  setTotalLayers(n: number): void { this.totalLayers = n; }

  /**
   * A layer change in Bambu's dialect. Without `M73 L` and `M991` the printer screen shows
   * "layer 1" for the whole print and the Bambu Studio preview merges every layer into one, even
   * though Z does physically rise. `M73 P/R` (percent and minutes) is filled in by toString(),
   * once the total time is known.
   */
  layer(z: number): void {
    this.z = z;
    this.layerNo += 1;
    // No separate "G1 Z", the same way Bambu Studio does it: Z changes during the layer's first
    // travel move (G1 X Y Z with a hop, then a descent to the layer Z).
    this.lines.push("; CHANGE_LAYER", `; Z_HEIGHT: ${f3(z)}`, `; LAYER_HEIGHT: ${f3(this.layerH)}`);
    this.lines.push(`; layer num/total_layer_count: ${this.layerNo}/${this.totalLayers || "?"}`, "; update layer progress", `M73 L${this.layerNo}`, `M991 S0 P${this.layerNo - 1} ;notify layer change`);
    this.layerMarks.push({ line: this.lines.length, timeSec: this.timeSec });
    this.lines.push("M73 P0 R0"); // placeholder, filled in by toString()
    this.lastF = -1;
    this.zReached = false;
  }

  /**
   * A pause for a filament change (on Bambu, M400 U1 waits for confirmation on the screen).
   * The head parks aside so the nozzle does not ooze onto the disc.
   */
  colorChangePause(parkX = 20, parkY = 240): void {
    this.retract();
    this.lines.push(
      "; ===== colour change =====",
      // The markers must have no space after the semicolon: that is the only form the Bambu
      // Studio preview parses, and the only way the colour change dot appears on the layer slider.
      ";COLOR_CHANGE,T0",
      ";PAUSE_PRINT",
      `G1 Z${f3(this.z + 5)} F600`,
      `G1 X${f3(parkX)} Y${f3(parkY)} F12000`,
      "M400 U1 ; pause: load the second colour and resume on the printer screen",
      `G1 Z${f3(this.z)} F600`,
    );
    this.cur = { x: parkX, y: parkY };
    this.lastF = -1;
  }

  /** Path role marker, which Bambu Studio uses to colour and filter the preview, plus line width. */
  feature(role: string, widthMm: number): void {
    this.lines.push(`; FEATURE: ${role}`, `; LINE_WIDTH: ${widthMm.toFixed(2)}`);
  }

  private feed(mmS: number): string {
    const f = Math.round(mmS * 60);
    if (f === this.lastF) return "";
    this.lastF = f;
    return ` F${f}`;
  }

  /** Movement acceleration (M204 S). The Bambu header leaves 10 m/s^2, too much for layer one. */
  setAccel(mmS2: number): void { this.lines.push(`M204 S${Math.round(mmS2)}`); }

  /** Part cooling fan (0-255) and optionally the auxiliary P2 fan. */
  fan(pwm: number, aux?: number): void {
    this.lines.push(`M106 S${Math.round(pwm)}`);
    if (aux !== undefined) this.lines.push(`M106 P2 S${Math.round(aux)}`);
  }

  private recent: Pt[] = []; // the last few path points, used to wipe on retraction

  /**
   * Retraction with a wipe, as Bambu Studio does it: retrace the last ~2 mm of the path while
   * pulling the filament back. Without it every path ends in a blob, and in a closed ring that
   * blob sits in the groove and the stylus catches it once per turn.
   */
  private retract(): void {
    if (this.retracted) return;
    const f = Math.round(this.o.retractSpeedMmS * 60);
    if (this.recent.length >= 2) {
      const pts = [...this.recent].reverse();
      let total = 0;
      const segs: { p: Pt; d: number }[] = [];
      for (let i = 1; i < pts.length && total < 2; i += 1) {
        const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        segs.push({ p: pts[i], d }); total += d;
      }
      this.lines.push("; WIPE_START");
      for (const sg of segs) this.lines.push(`G1 X${f3(sg.p.x)} Y${f3(sg.p.y)} E-${f5((this.o.retractMm * sg.d) / total)} F${f}`);
      this.lines.push("; WIPE_END");
      if (segs.length) this.cur = segs[segs.length - 1].p;
    } else {
      this.lines.push(`G1 E-${f3(this.o.retractMm)} F${f}`);
    }
    this.recent = [];
    this.lastF = -1; this.retracted = true;
  }
  private unretract(): void {
    if (!this.retracted) return;
    this.lines.push(`G1 E${f3(this.o.retractMm)} F${Math.round(this.o.retractSpeedMmS * 60)}`);
    this.lastF = -1; this.retracted = false;
  }

  travel(p: Pt): void {
    if (this.cur && Math.hypot(p.x - this.cur.x, p.y - this.cur.y) < 0.01 && this.zReached) return;
    this.retract();
    const hop = this.cur === null ? Math.max(this.o.zHopMm, 0.4) : this.o.zHopMm; // first move: clear the purge line
    const d = this.cur ? Math.hypot(p.x - this.cur.x, p.y - this.cur.y) : 0;
    // Exactly as Bambu Studio does: travel with the hop in one G1, then descend to the layer Z.
    this.lines.push(`G1 X${f3(p.x)} Y${f3(p.y)} Z${f3(this.z + hop)} F${Math.round(this.o.travelSpeedMmS * 60)}`);
    this.lines.push(`G1 Z${f3(this.z)} F600`);
    this.zReached = true;
    this.lastF = -1;
    this.timeSec += d / this.o.travelSpeedMmS;
    this.cur = p;
  }

  private emitSeg(to: PathPoint, speedMmS: number): void {
    const from = this.cur!;
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    if (d < 1e-6) return;
    const e = d * extrusionPerMm(to.w, this.layerH, this.o.filamentDiameterMm);
    this.lines.push(`G1 X${f3(to.x)} Y${f3(to.y)} E${f5(e)}${this.feed(speedMmS)}`);
    this.pathLengthMm += d; this.filamentMm += e; this.timeSec += d / speedMmS;
    this.cur = to;
    this.recent.push(to);
    if (this.recent.length > 12) this.recent.shift();
  }

  /**
   * Extrudes a polyline. The first point is a travel move. Intermediate points are dropped as
   * long as EVERY one of them lies within tolerance of the segment anchor->q. This is checked
   * with a cone algorithm: for a skipped point at distance d from the anchor, the allowed segment
   * direction lies within +-asin(tol/d) of the direction to that point. The intersection of those
   * intervals is maintained incrementally, so the whole pass is O(n) and the test stays exact.
   */
  extrudePath(points: PathPoint[], speedMmS: number, role?: string): void {
    if (points.length < 2) return;
    this.travel(points[0]);
    this.unretract();
    if (role) this.feature(role, points[0].w);
    let anchor: PathPoint = points[0];
    let base = 0, lo = 0, hi = 0, have = false;
    let last: PathPoint | null = null;

    const restart = (from: PathPoint) => { anchor = from; have = false; last = null; };

    for (let i = 1; i < points.length; i += 1) {
      const q = points[i];
      const dx = q.x - anchor.x, dy = q.y - anchor.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-9) continue;
      const widthChanged = last !== null && Math.abs(q.w - anchor.w) >= 0.02;
      const ang = Math.atan2(dy, dx);
      const half = d > this.tol ? Math.asin(this.tol / d) : Math.PI;
      if (!have) {
        base = ang; lo = -half; hi = half; have = true; last = q; continue;
      }
      let rel = ang - base;
      while (rel > Math.PI) rel -= 2 * Math.PI;
      while (rel < -Math.PI) rel += 2 * Math.PI;
      const nLo = Math.max(lo, rel - half), nHi = Math.min(hi, rel + half);
      if (widthChanged || nLo > nHi) {
        this.emitSeg(last!, speedMmS);
        restart(last!);
        i -= 1; // reconsider the same point against the new anchor
        continue;
      }
      lo = nLo; hi = nHi; last = q;
    }
    if (last) this.emitSeg(last, speedMmS);
  }

  stats(): { pathLengthMm: number; filamentMm: number; timeSec: number; lines: number } {
    return { pathLengthMm: this.pathLengthMm, filamentMm: this.filamentMm, timeSec: this.timeSec, lines: this.lines.length };
  }
  toString(): string {
    const total = Math.max(this.timeSec, 1);
    for (const m of this.layerMarks) {
      const pct = Math.min(99, Math.floor((m.timeSec / total) * 100));
      const remainMin = Math.max(0, Math.ceil((total - m.timeSec) / 60));
      this.lines[m.line] = `M73 P${pct} R${remainMin}`;
    }
    return this.lines.join("\n") + "\n";
  }
}

function pointLineDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dx * (a.y - p.y) - dy * (a.x - p.x)) / len;
}
