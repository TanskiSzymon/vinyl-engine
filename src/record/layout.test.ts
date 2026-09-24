import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, maxDurationSec, musicTurns, pitchMm, validate, withOverrides } from "./layout";

describe("layout", () => {
  it("defaults are valid", () => { expect(validate(DEFAULT_PARAMS)).toEqual([]); });
  it("pitch = 2*bead + gap + 2*A + landMin", () => {
    const p = DEFAULT_PARAMS;
    expect(pitchMm(p)).toBeCloseTo(2 * p.beadWidthMm + p.grooveGapMm + 2 * p.amplitudeMm + p.landMinMm, 6);
  });
  it("music turns and duration at 78 rpm on 250 mm", () => {
    const n = musicTurns(DEFAULT_PARAMS);
    expect(n).toBeGreaterThanOrEqual(18); // the V trench has a ~2.6 mm pitch, so about 19 turns
    expect(maxDurationSec(DEFAULT_PARAMS)).toBeCloseTo((n * 60) / 78, 6);
  });
  it("rejects inner radius below tonearm reach and too small land", () => {
    expect(validate(withOverrides(DEFAULT_PARAMS, { innerGrooveR: 50 }))).toEqual([expect.stringMatching(/innerGrooveR/)]);
    const tight = validate(withOverrides(DEFAULT_PARAMS, { landMinMm: 0.3 }));
    expect(tight.join(" ")).toMatch(/the land in the top layer/);
    expect(tight.join(" ")).toMatch(/the ridge between grooves/);
  });
  it("rejects disc larger than bed", () => {
    expect(validate(withOverrides(DEFAULT_PARAMS, { diameterMm: 260 }))).toEqual([expect.stringMatching(/diameterMm/)]);
  });
});
