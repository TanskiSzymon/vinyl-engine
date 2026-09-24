import type { DecorStyle } from "../gcode/decor";

// Disc parameters and everything derived from them. All units are mm, s, Hz.
// The defaults are the measured values for a Bambu Lab P1S, 0.4 mm nozzle, PLA.

export type RecordParams = {
  diameterMm: number;       // disc diameter (P1S bed is 256, so 250 is the practical maximum)
  holeMm: number;           // spindle hole (an AT-LP120X spindle is 7.2 mm); PLA shrinks holes by
                            // about 0.2 mm, hence 7.5
  outerGrooveR: number;     // radius where the lead-in starts
  innerGrooveR: number;     // smallest radius the groove may reach (a tonearm stops around 58 mm)
  rpm: number;
  amplitudeMm: number;      // peak radial excursion of the groove
  beadWidthMm: number;      // extrusion width of the groove walls
  grooveGapMm: number;      // width of the trench floor: the gap between the left and right bead
                            // edges in the lowest wall layer
  landMinMm: number;        // nominal width of the land between neighbouring grooves, at the floor
  /** Nozzle diameter. It does not enter the geometry directly, but it goes into the G-code header:
   *  the printer compares it with the nozzle that is installed and refuses to print on a mismatch. */
  nozzleMm: number;
  layerHeightMm: number;
  /** Base layers may be thicker than groove layers. The base is a plain slab, and with a fine
   *  nozzle printing it at the groove layer height doubles the print time for no benefit. */
  baseLayerHeightMm: number;
  baseLayers: number;       // solid base layers; their top face is the trench floor
  wallLayers: number;       // groove wall layers; trench depth = wallLayers * layerHeight
  wallStepMm: number;       // how far each wall layer steps outward, which makes the groove a
                            // stepped V (the same shape Ghassaei's model uses)
  landSpeedMmS: number;     // the land carries no groove edge, so it can run faster than the walls
  leadInTurns: number;
  leadInPitchMm: number;
  /** Amplitude ramp at the start and the end: the stylus should not meet a full wave at once. */
  amplitudeRampSec: number;
  sampleRate: number;
  lowpassHz: number;
  highpassHz: number;
  riaaPreEmphasis: boolean;
  /**
   * The smallest radius of curvature a bead still draws. Below it the material smears across the
   * whole amplitude and fills the groove in (that is how the first tuning disc died).
   *
   * The value 0.17 mm comes from MEASURING a printed disc: at 45 rpm and 0.15 mm amplitude the
   * response fell off a cliff at 540 Hz at a radius of 115 mm, which is exactly where the path's
   * radius of curvature drops to 0.17 mm.
   *
   * NOTE: the limit depends on amplitude, not only on wavelength. A sine of amplitude A and
   * wavelength L has a peak radius of curvature of L^2/(4*pi^2*A), so doubling the amplitude
   * needs a wave 41% longer. An earlier model ignored this and allowed paths at high amplitude
   * that the nozzle cannot draw.
   */
  minCurvatureMm: number;
  driveDb: number;          // gain before the soft limiter (Ghassaei: "amplify, some clipping is fine")
  /**
   * Lift for the top of the usable band. The mechanical response falls with frequency (measured:
   * -18 dB at 100 Hz, -22 dB at 470 Hz), and without this the disc sounds like it is playing
   * behind a wall. The high shelf sits relative to the band ceiling, so it travels inward with it.
   */
  presenceDb: number;
  /** Dynamic range compression: lifts quiet passages above the constant surface noise. 0 = off. */
  compressionDb: number;
  grooveSpeedMmS: number;
  baseSpeedMmS: number;
  firstLayerSpeedMmS: number;
  firstLayerWidthMm: number;
  pointSpacingMm: number;   // point spacing along the walls
  landPointSpacingMm: number;
  simplifyTolMm: number;
  baseSimplifyTolMm: number;   // the base is a flat floor, so a coarser tolerance shrinks the file
  colorChange: boolean;     // two colours: base in one, grooves and decoration in the other
  /** 0 = change by hand (a pause). 1..3 = a real toolchange to that AMS tool number. */
  amsSlot: number;
  flushVolumeMm3: number;   // purge volume on an AMS change (the profile uses 140-175 for PLA)
  /** How many groove layers the decoration spans. The relief has to stay shallow: with a 0.4 mm
   *  nozzle one layer is 0.2 mm, with 0.2 mm it takes two layers (0.16 mm) to be visible. */
  decorLayers: number;
  decorStyle: DecorStyle;
  labelText: string[];          // up to two lines engraved in the middle of the disc
  watermark: string;            // small text next to the spindle hole; empty by default
  labelTextHeightMm: number;    // cap height
  filamentDiameterMm: number;
  centerX: number;
  centerY: number;
  bedMm: number;
};

export const DEFAULT_PARAMS: RecordParams = {
  diameterMm: 250, holeMm: 7.5, outerGrooveR: 123, innerGrooveR: 56, rpm: 78,
  amplitudeMm: 0.10, beadWidthMm: 0.42, grooveGapMm: 0.15, landMinMm: 0.54,
  nozzleMm: 0.4, layerHeightMm: 0.2, baseLayerHeightMm: 0.2, baseLayers: 3, wallLayers: 3, wallStepMm: 0.07, landSpeedMmS: 90,
  leadInTurns: 1, leadInPitchMm: 3, amplitudeRampSec: 0.4,
  sampleRate: 8000, lowpassHz: 1200, highpassHz: 150, riaaPreEmphasis: true, minCurvatureMm: 0.17,
  driveDb: 0, presenceDb: 8, compressionDb: 8,
  grooveSpeedMmS: 20, baseSpeedMmS: 200, firstLayerSpeedMmS: 50, firstLayerWidthMm: 0.5,
  pointSpacingMm: 0.2, landPointSpacingMm: 0.6, simplifyTolMm: 0.004, baseSimplifyTolMm: 0.03,
  colorChange: false, amsSlot: 0, flushVolumeMm3: 175, decorLayers: 1, decorStyle: "rings", labelText: [], labelTextHeightMm: 7, watermark: "",
  filamentDiameterMm: 1.75, centerX: 128, centerY: 128, bedMm: 256,
};

/**
 * A coherent parameter set for a given nozzle. Every groove dimension scales with extrusion
 * width, so changing the nozzle alone would give a groove the printer cannot draw.
 *
 * The curvature threshold is scaled in proportion to extrusion width: 0.17 mm measured for a
 * 0.42 mm bead gives 0.089 mm for a 0.22 mm bead. That is an assumption, not a measurement.
 */
export function nozzleProfile(nozzleMm: number): Partial<RecordParams> {
  if (nozzleMm >= 0.35) return {};                    // 0.4: the defaults above, all measured
  const bead = nozzleMm * 1.1;                        // realistic extrusion width
  return {
    nozzleMm,
    beadWidthMm: Number(bead.toFixed(3)),
    firstLayerWidthMm: Number((bead * 1.2).toFixed(3)),
    layerHeightMm: 0.08,
    baseLayerHeightMm: 0.14,
    minCurvatureMm: Number((0.17 * (bead / 0.42)).toFixed(4)),
    grooveGapMm: 0.08,
    wallStepMm: 0.03,
    wallLayers: 5,                                    // a 0.4 mm deep groove
    landMinMm: 0.42,
    amplitudeMm: 0.06,
    decorLayers: 2,
    baseLayers: 6,                                    // 0.08 + 5x0.14 = 0.78 mm of base
    lowpassHz: 2600,
    grooveSpeedMmS: 25,
    landSpeedMmS: 60,
    baseSpeedMmS: 140,
    firstLayerSpeedMmS: 35,
    pointSpacingMm: 0.1,
    landPointSpacingMm: 0.35,
    simplifyTolMm: 0.002,
    baseSimplifyTolMm: 0.02,
  };
}

export function withOverrides(p: RecordParams, o: Partial<RecordParams>): RecordParams {
  return { ...p, ...o };
}

export function pitchMm(p: RecordParams): number {
  return 2 * p.beadWidthMm + p.grooveGapMm + 2 * p.amplitudeMm + p.landMinMm;
}

/** Radius where the music starts, that is after the lead-in. */
export function musicStartR(p: RecordParams): number {
  return p.outerGrooveR - p.leadInTurns * p.leadInPitchMm;
}

/** Turns of music; one pitch is reserved for the lead-out and the locked groove. */
export function musicTurns(p: RecordParams): number {
  return Math.floor((musicStartR(p) - p.innerGrooveR) / pitchMm(p)) - 1;
}

/** Linear speed of the stylus (and of the bead) at radius r, in mm/s. */
export function linearSpeed(p: RecordParams, radiusMm: number): number {
  return (2 * Math.PI * radiusMm * p.rpm) / 60;
}

/**
 * The highest frequency a bead can draw at a given radius and amplitude.
 * From the curvature condition at the peak of a sine, L^2/(4*pi^2*A) >= minCurvature,
 * so L >= 2*pi*sqrt(minCurvature*A), and f = v/L.
 */
export function trackableHz(p: RecordParams, radiusMm: number, amplitudeMm = p.amplitudeMm): number {
  const minWave = 2 * Math.PI * Math.sqrt(p.minCurvatureMm * Math.max(0.01, amplitudeMm));
  return linearSpeed(p, radiusMm) / minWave;
}

/** Bandwidth at the rim and at the centre of the disc, for display. */
export function bandwidth(p: RecordParams): { outer: number; inner: number } {
  return {
    outer: Math.min(p.lowpassHz, Math.round(trackableHz(p, p.outerGrooveR))),
    inner: Math.min(p.lowpassHz, Math.round(trackableHz(p, p.innerGrooveR))),
  };
}

/** Filter ceiling for a given speed. The hard ceiling is still trackableHz. */
export function lowpassForRpm(rpm: number, at78 = 1200): number {
  return Math.round((at78 * rpm) / 78);
}

export function maxDurationSec(p: RecordParams): number {
  return (musicTurns(p) * 60) / p.rpm;
}

export function validate(p: RecordParams): string[] {
  const e: string[] = [];
  // The decoration is a relief on top of the base, not a second disc: above two layers it starts
  // to compete with the groove walls for height and can catch the stylus.
  if (p.decorLayers < 0 || p.decorLayers > 2) e.push(`decorLayers ${p.decorLayers} outside the range 0..2`);
  if (p.decorLayers > p.wallLayers) e.push(`decorLayers ${p.decorLayers} > wallLayers ${p.wallLayers}`);
  if (p.diameterMm > p.bedMm - 6) e.push(`diameterMm ${p.diameterMm} > bed ${p.bedMm} - 6`);
  // The groove wall plus the seam scatter has to fit inside the edge of the disc.
  if (p.outerGrooveR > p.diameterMm / 2 - 1.5) e.push(`outerGrooveR ${p.outerGrooveR} is too close to the edge of the disc`);
  if (p.leadInTurns < 1) e.push(`leadInTurns ${p.leadInTurns} < 1, with less than one turn the stylus can land straight in the music`);
  if (p.innerGrooveR < 54) e.push(`innerGrooveR ${p.innerGrooveR} < 54, a tonearm does not reach that far in`);
  // The thresholds scale with extrusion width: with a fine nozzle everything is proportionally
  // smaller, so the fixed numbers from the 0.4 profile would reject correct 0.2 geometry.
  const landTop = 2 * p.amplitudeMm + p.landMinMm - 2 * (p.wallLayers - 1) * p.wallStepMm;
  const minLand = p.beadWidthMm * 1.05;               // the land has to fit at least one extrusion
  if (landTop + 1e-9 < minLand) e.push(`the land in the top layer is ${landTop.toFixed(2)} mm < ${minLand.toFixed(2)}, raise landMinMm or lower wallLayers`);
  const ridge = landTop - 2 * p.amplitudeMm;          // the ridge when both neighbours swing fully
  const minRidge = p.beadWidthMm * 0.6;
  if (ridge + 1e-9 < minRidge) e.push(`the ridge between grooves at full excursion is ${ridge.toFixed(2)} mm < ${minRidge.toFixed(2)}`);
  if (p.wallStepMm > p.beadWidthMm * 0.5) e.push(`wallStepMm ${p.wallStepMm} > half a bead, the wall would hang in mid air`);
  if (p.amplitudeMm <= 0) e.push("amplitudeMm has to be > 0");
  if (musicTurns(p) < 1) e.push("not enough room for even one turn of music");
  if (p.lowpassHz >= p.sampleRate / 2) e.push("lowpassHz >= Nyquist");
  return e;
}

/** Top of the base. The first layer stays thin for adhesion, the rest are thick to save time. */
export function baseTopZ(p: RecordParams): number {
  return p.layerHeightMm + (p.baseLayers - 1) * p.baseLayerHeightMm;
}
