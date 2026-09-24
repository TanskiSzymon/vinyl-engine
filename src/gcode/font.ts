// A single stroke font (Hershey simplex style): every letter is a set of polylines the nozzle
// draws in one pass. An ordinary outline font would have to be filled, and with a 0.42 mm
// extrusion width anything below 8 mm would merge into a blob.
//
// Siatka glifu: x 0..6, y 0..10 (linia bazowa y=0, wysokosc wersalika 10). Segmenty rozdziela
// "|", punkty spacja, wspolrzedne przecinek.

const GLYPHS: Record<string, string> = {
  A: "0,0 3,10 6,0|1.2,3.5 4.8,3.5",
  B: "0,0 0,10 4,10 5,9 5,6 4,5 0,5|4,5 5.5,4 5.5,1 4,0 0,0",
  C: "6,8 4,10 2,10 0,8 0,2 2,0 4,0 6,2",
  D: "0,0 0,10 3,10 6,7 6,3 3,0 0,0",
  E: "6,10 0,10 0,5 4,5|0,5 0,0 6,0",
  F: "6,10 0,10 0,5 4,5|0,5 0,0",
  G: "6,8 4,10 2,10 0,8 0,2 2,0 4,0 6,2 6,4 3.5,4",
  H: "0,0 0,10|6,0 6,10|0,5 6,5",
  I: "1,10 5,10|3,10 3,0|1,0 5,0",
  J: "5,10 5,2 3,0 1,0 0,2",
  K: "0,0 0,10|0,4 6,10|2,6 6,0",
  L: "0,10 0,0 6,0",
  M: "0,0 0,10 3,5 6,10 6,0",
  N: "0,0 0,10 6,0 6,10",
  O: "2,10 4,10 6,8 6,2 4,0 2,0 0,2 0,8 2,10",
  P: "0,0 0,10 4,10 6,8 6,7 4,5 0,5",
  Q: "2,10 4,10 6,8 6,2 4,0 2,0 0,2 0,8 2,10|3.5,2.5 6,-0.5",
  R: "0,0 0,10 4,10 6,8 6,7 4,5 0,5|3,5 6,0",
  S: "6,9 4,10 2,10 0,8.5 0,6.5 2,5 4,5 6,3.5 6,1.5 4,0 2,0 0,1",
  T: "0,10 6,10|3,10 3,0",
  U: "0,10 0,2 2,0 4,0 6,2 6,10",
  V: "0,10 3,0 6,10",
  W: "0,10 1.5,0 3,7 4.5,0 6,10",
  X: "0,0 6,10|0,10 6,0",
  Y: "0,10 3,5 6,10|3,5 3,0",
  Z: "0,10 6,10 0,0 6,0",
  "0": "2,10 4,10 6,8 6,2 4,0 2,0 0,2 0,8 2,10|0,2 6,8",
  "1": "1.5,8 3,10 3,0|1,0 5,0",
  "2": "0,8.5 2,10 4,10 6,8 6,6.5 0,0 6,0",
  "3": "0,10 6,10 3,6|3,6 5,6 6,4.5 6,1.5 4,0 2,0 0,1.5",
  "4": "4.5,0 4.5,10 0,3.5 6,3.5",
  "5": "6,10 1,10 0.5,6 3,6.5 5,6 6,4 6,2 4,0 2,0 0,1",
  "6": "5,10 2,10 0,7 0,2 2,0 4,0 6,2 6,4 4,6 2,6 0,4",
  "7": "0,10 6,10 2,0",
  "8": "2,5 0,6.5 0,8.5 2,10 4,10 6,8.5 6,6.5 4,5 2,5 0,3.5 0,1.5 2,0 4,0 6,1.5 6,3.5 4,5",
  "9": "1,0 4,0 6,3 6,8 4,10 2,10 0,8 0,6 2,4 4,4 6,6",
  ".": "2.6,0 3.4,0 3.4,0.8 2.6,0.8 2.6,0",
  ",": "3.4,0.8 3.4,0 2.4,-1.5",
  "-": "1,5 5,5",
  "'": "3,10 3,7.5",
  '"': "2,10 2,7.5|4,10 4,7.5",
  "!": "3,10 3,3|3,1 3,0",
  "?": "0,8.5 2,10 4,10 6,8.5 6,7 3,5 3,3|3,1 3,0",
  "/": "0,0 6,10",
  ":": "3,7 3,6|3,3 3,2",
  "(": "4,10 1,7 1,3 4,0",
  ")": "2,10 5,7 5,3 2,0",
  "+": "3,8 3,2|0,5 6,5",
  "&": "6,0 1.5,7 1.5,9 3,10 4.5,9 4.5,7 0,3 0,1 1.5,0 3,0 6,3",
  " ": "",
};

// Accented letters: the base glyph plus a stroke, a tail or a dot.
const ACCENT = "2.5,11.5 4.5,13";
const OGONEK = "3.6,0 4.2,-1.2 3,-2.2";
const DIACRITICS: Record<string, [string, string]> = {
  Ą: ["A", OGONEK], Ć: ["C", ACCENT], Ę: ["E", OGONEK], Ń: ["N", ACCENT],
  Ó: ["O", ACCENT], Ś: ["S", ACCENT], Ź: ["Z", ACCENT], Ż: ["Z", "2.6,11.5 3.4,11.5 3.4,12.3 2.6,12.3 2.6,11.5"],
  Ł: ["L", "0.5,2.5 3.5,6"],
};

export const GLYPH_WIDTH = 6;
export const GLYPH_HEIGHT = 10;

export type Poly = { x: number; y: number }[];

function parse(spec: string): Poly[] {
  if (!spec) return [];
  return spec.split("|").map((seg) => seg.trim().split(/\s+/).map((pt) => {
    const [x, y] = pt.split(",").map(Number);
    return { x, y };
  }));
}

/** Lamane pojedynczego znaku w siatce 0..6 x 0..10. Nieznany znak -> pusto. */
export function glyph(ch: string): Poly[] {
  const up = ch.toUpperCase();
  if (DIACRITICS[up]) {
    const [base, mark] = DIACRITICS[up];
    return [...parse(GLYPHS[base] ?? ""), ...parse(mark)];
  }
  return parse(GLYPHS[up] ?? "");
}

export function textWidthUnits(text: string, tracking = 2): number {
  return text.length === 0 ? 0 : text.length * (GLYPH_WIDTH + tracking) - tracking;
}

export type TextLayout = { capHeightMm: number; tracking?: number; centerX: number; baselineY: number };

/** Text as polylines in millimetres, centred horizontally on centerX. */
export function textPolys(text: string, o: TextLayout): Poly[] {
  const tracking = o.tracking ?? 2;
  const s = o.capHeightMm / GLYPH_HEIGHT;
  const totalW = textWidthUnits(text, tracking) * s;
  let penX = o.centerX - totalW / 2;
  const out: Poly[] = [];
  for (const ch of text) {
    for (const poly of glyph(ch)) {
      out.push(poly.map((p) => ({ x: penX + p.x * s, y: o.baselineY + p.y * s })));
    }
    penX += (GLYPH_WIDTH + tracking) * s;
  }
  return out;
}

/** Radius of the circle that encloses the text; the decoration has to stay outside it. */
export function textRadiusMm(lines: string[], capHeightMm: number, lineGapMm: number, tracking = 2): number {
  if (lines.length === 0) return 0;
  const s = capHeightMm / GLYPH_HEIGHT;
  const w = Math.max(...lines.map((l) => textWidthUnits(l, tracking) * s));
  const h = lines.length * capHeightMm + (lines.length - 1) * lineGapMm;
  return Math.hypot(w / 2, h / 2) + 1.5;
}
