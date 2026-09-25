import { describe, expect, it } from "vitest";
import { tone } from "../audio/synth";
import { buildRecordMesh, MESH_DEFAULTS, meshMaxDurationSec, meshNozzleProfile, meshPitchMm, type MeshParams } from "./record-mesh";

const p: MeshParams = { ...MESH_DEFAULTS, sampleRate: 8000, stepsPerTurn: 240, diameterMm: 180, outerGrooveR: 87, innerGrooveR: 58 };

describe("record mesh", () => {
  const { mesh, turns } = buildRecordMesh(p, tone(300, 3, p.sampleRate, 1));

  it("the solid is watertight", () => {
    expect(mesh.checkManifold()).toEqual([]);
  });

  it("fits inside the disc outline and between the bottom and the top", () => {
    const v = mesh.vertices;
    let maxR = 0, minR = Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < v.length; i += 3) {
      const r = Math.hypot(v[i] - p.centerX, v[i + 1] - p.centerY);
      maxR = Math.max(maxR, r); minR = Math.min(minR, r);
      minZ = Math.min(minZ, v[i + 2]); maxZ = Math.max(maxZ, v[i + 2]);
    }
    expect(maxR).toBeCloseTo(p.diameterMm / 2, 3);
    expect(minR).toBeCloseTo(p.holeMm / 2, 3);
    expect(minZ).toBe(0);
    expect(maxZ).toBeCloseTo(p.thicknessMm, 6);
  });

  it("the groove floor sits exactly at the requested depth", () => {
    const v = mesh.vertices;
    let floor = Infinity;
    for (let i = 0; i < v.length; i += 3) if (v[i + 2] > 0) floor = Math.min(floor, v[i + 2]);
    expect(floor).toBeCloseTo(p.thicknessMm - p.grooveDepthMm, 6);
  });

  it("the turn count and the capacity agree with the pitch", () => {
    expect(turns).toBe(Math.ceil((3 * p.rpm) / 60));
    expect(meshPitchMm(p)).toBeCloseTo(p.grooveTopMm + 2 * p.amplitudeMm + p.landMm, 6);
    expect(meshMaxDurationSec(p)).toBeGreaterThan(10);
  });

  /**
   * The excursion of the groove axis with the spiral trend removed. Vertices come in fours,
   * A,B,C,D per step, so the axis of step i is the mean of the B and C radii.
   */
  function modulationAmplitude(sig: Float32Array): number {
    const { mesh: mm } = buildRecordMesh(p, sig);
    const v = mm.vertices;
    const axisR = (i: number) => {
      const rr = (k: number) => Math.hypot(v[3 * k] - p.centerX, v[3 * k + 1] - p.centerY);
      return (rr(4 * i + 1) + rr(4 * i + 2)) / 2;
    };
    const from = p.stepsPerTurn * 2, to = from + p.stepsPerTurn; // w srodku czesci muzycznej
    const n = to - from;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = from; i < to; i += 1) { const y = axisR(i); sx += i; sy += y; sxx += i * i; sxy += i * y; }
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
    let peak = 0;
    for (let i = from; i < to; i += 1) peak = Math.max(peak, Math.abs(axisR(i) - (a + b * i)));
    return peak;
  }

  it("the groove follows the signal, and silence gives a smooth spiral", () => {
    expect(modulationAmplitude(tone(300, 3, p.sampleRate, 1))).toBeGreaterThan(p.amplitudeMm * 0.85);
    expect(modulationAmplitude(new Float32Array(3 * p.sampleRate))).toBeLessThan(0.001);
  });

  it("there are only as many degenerate faces as the spiral seam forces", () => {
    const v = mesh.vertices, tri = mesh.triangles;
    let degenerate = 0;
    for (let i = 0; i < tri.length; i += 3) {
      const [a, b, c] = [tri[i], tri[i + 1], tri[i + 2]];
      const ax = v[3 * a], ay = v[3 * a + 1], az = v[3 * a + 2];
      const bx = v[3 * b] - ax, by = v[3 * b + 1] - ay, bz = v[3 * b + 2] - az;
      const cx = v[3 * c] - ax, cy = v[3 * c + 1] - ay, cz = v[3 * c + 2] - az;
      const area = Math.hypot(by * cz - bz * cy, bz * cx - bx * cz, bx * cy - by * cx) / 2;
      if (area < 1e-9) degenerate += 1;
    }
    expect(degenerate).toBeLessThanOrEqual(4);
  });

  it("a finer nozzle tightens the pitch, keeps the land printable and stays watertight", () => {
    const fine: MeshParams = { ...p, ...meshNozzleProfile(0.2), stepsPerTurn: 240 };
    expect(meshPitchMm(fine)).toBeLessThan(meshPitchMm(p) * 0.7);
    // the land has to hold at least two extrusion paths, or a slicer drops the ridge entirely
    expect(fine.landMm).toBeGreaterThanOrEqual(2 * 0.22);
    expect(fine.grooveFloorMm).toBeGreaterThanOrEqual(0.22);
    expect(fine.grooveDepthMm).toBeGreaterThan(fine.grooveFloorMm);
    expect(fine.thicknessMm).toBeGreaterThan(fine.grooveDepthMm + 0.6);
    const built = buildRecordMesh(fine, tone(300, 3, fine.sampleRate, 1));
    expect(built.mesh.checkManifold()).toEqual([]);
    expect(meshMaxDurationSec(fine)).toBeGreaterThan(meshMaxDurationSec(p) * 1.4);
  });

  it("leaves a 0.4 mm nozzle on the measured defaults", () => {
    expect(meshNozzleProfile(0.4)).toEqual({});
  });

  it("raised label text sits on the plateau, inside the groove band, and keeps the solid closed", () => {
    const plain = buildRecordMesh(p, tone(300, 3, p.sampleRate, 1));
    const titled = buildRecordMesh({ ...p, labelText: ["SIDE A", "1987"] }, tone(300, 3, p.sampleRate, 1));
    expect(titled.mesh.triangleCount).toBeGreaterThan(plain.mesh.triangleCount);
    expect(titled.mesh.checkManifold()).toEqual([]);
    const zFloor = p.thicknessMm - p.grooveDepthMm;
    const v = titled.mesh.vertices;
    let maxTextR = 0, maxZ = 0;
    for (let i = plain.mesh.vertexCount * 3; i < v.length; i += 3) {
      maxTextR = Math.max(maxTextR, Math.hypot(v[i] - p.centerX, v[i + 1] - p.centerY));
      maxZ = Math.max(maxZ, v[i + 2]);
      expect(v[i + 2]).toBeGreaterThanOrEqual(zFloor - 1e-9);
    }
    expect(maxTextR).toBeLessThan(p.innerGrooveR);
    let minTextR = Infinity;
    for (let i = plain.mesh.vertexCount * 3; i < v.length; i += 3) {
      minTextR = Math.min(minTextR, Math.hypot(v[i] - p.centerX, v[i + 1] - p.centerY));
    }
    expect(minTextR).toBeGreaterThan(p.holeMm / 2);   // never bridges the spindle hole
    expect(maxZ).toBeCloseTo(zFloor + p.labelReliefMm, 6);
  });

  it("the rim and the label sit at floor level so a filament change splits base from grooves", () => {
    const zFloor = p.thicknessMm - p.grooveDepthMm;
    const v = mesh.vertices;
    let rimZ = -1, labelZ = -1;
    for (let i = 0; i < v.length; i += 3) {
      const r = Math.hypot(v[i] - p.centerX, v[i + 1] - p.centerY);
      if (r > p.diameterMm / 2 - 0.01) rimZ = Math.max(rimZ, v[i + 2]);
      if (r < p.holeMm / 2 + 0.01) labelZ = Math.max(labelZ, v[i + 2]);
    }
    expect(rimZ).toBeCloseTo(zFloor, 6);
    expect(labelZ).toBeCloseTo(zFloor, 6);   // the label plateau is the top of the hole ring
  });
});
