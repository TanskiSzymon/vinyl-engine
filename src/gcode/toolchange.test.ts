import { describe, expect, it } from "vitest";
import { GcodeWriter } from "./emit";
import { emitToolChange } from "./toolchange";

const opts = { filamentDiameterMm: 1.75, layerHeightMm: 0.2, retractMm: 0.8, retractSpeedMmS: 30, travelSpeedMmS: 200, simplifyTolMm: 0.004, zHopMm: 0.2 };

describe("emitToolChange", () => {
  const w = new GcodeWriter(opts);
  emitToolChange(w, { slot: 1, z: 0.6, nozzleTempC: 220, flushVolumeMm3: 175, retractToolchangeMm: 2 });
  const g = w.toString(), lines = g.split("\n");

  it("otwiera i zamyka sekwencje AMS tym samym slotem", () => {
    expect(lines.filter((l) => l === "M620 S1A")).toHaveLength(1);
    expect(lines.filter((l) => l === "M621 S1A")).toHaveLength(1);
    expect(g.indexOf("M620 S1A")).toBeLessThan(g.indexOf("T1"));
    expect(g.indexOf("T1")).toBeLessThan(g.indexOf("M621 S1A"));
  });

  it("przeplukuje zadana objetosc filamentu", () => {
    const flush = g.slice(g.indexOf("; FLUSH_START"), g.indexOf("; FLUSH_END"));
    const mm = [...flush.matchAll(/^G1 E([\d.]+) F/gm)].reduce((a, m) => a + Number(m[1]), 0);
    expect(mm).toBeCloseTo(175 / 2.4053, 0);
  });

  it("every XY move stays inside the P1S work area", () => {
    for (const l of lines) {
      const mx = /^G1 X(-?[\d.]+)/.exec(l), my = /Y(-?[\d.]+)/.exec(l);
      if (mx) { expect(Number(mx[1])).toBeGreaterThanOrEqual(0); expect(Number(mx[1])).toBeLessThanOrEqual(256); }
      if (my && l.startsWith("G1 ")) { expect(Number(my[1])).toBeGreaterThanOrEqual(-3); expect(Number(my[1])).toBeLessThanOrEqual(266); }
    }
  });

  it("returns to the layer height and restores nozzle pressure", () => {
    const tail = lines.filter((l) => l.length > 0).slice(-3);
    expect(tail[0]).toBe("G1 Z0.60 F600");
    expect(tail[1]).toBe("G1 E2 F1800");
  });
});
