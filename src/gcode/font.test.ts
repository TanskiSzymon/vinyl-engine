import { describe, expect, it } from "vitest";
import { glyph, GLYPH_HEIGHT, GLYPH_WIDTH, textPolys, textRadiusMm } from "./font";

describe("font jednoliniowy", () => {
  it("every glyph stays inside the glyph grid", () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,-'\"!?/:()+& ĄĆĘŁŃÓŚŹŻ";
    for (const ch of chars) {
      for (const poly of glyph(ch)) {
        for (const p of poly) {
          expect(p.x).toBeGreaterThanOrEqual(-0.01);
          expect(p.x).toBeLessThanOrEqual(GLYPH_WIDTH + 0.01);
          expect(p.y).toBeGreaterThanOrEqual(-2.3);
          expect(p.y).toBeLessThanOrEqual(13.01);
        }
      }
    }
  });

  it("a space is empty and an unknown character does not throw", () => {
    expect(glyph(" ")).toEqual([]);
    expect(glyph("☃")).toEqual([]);
  });

  it("polskie znaki maja wiecej kresek niz ich podstawa", () => {
    for (const [pl, base] of [["Ą", "A"], ["Ć", "C"], ["Ł", "L"], ["Ż", "Z"]]) {
      expect(glyph(pl).length).toBeGreaterThan(glyph(base).length);
    }
  });

  it("text is centred and has the requested height", () => {
    const polys = textPolys("AV", { capHeightMm: 5, centerX: 100, baselineY: 20 });
    const xs = polys.flat().map((p) => p.x), ys = polys.flat().map((p) => p.y);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(100, 1);
    expect(Math.min(...ys)).toBeCloseTo(20, 1);
    expect(Math.max(...ys)).toBeCloseTo(25, 1);
  });

  it("promien obejmujacy rosnie z dlugoscia napisu", () => {
    expect(textRadiusMm(["DLUGI NAPIS"], 5, 2)).toBeGreaterThan(textRadiusMm(["A"], 5, 2));
  });
});
