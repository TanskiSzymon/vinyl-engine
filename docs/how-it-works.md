# How the engine works

Everything here was worked out on a Bambu Lab P1S with PLA, and most of the numbers come from
measuring discs that were actually printed and played, not from theory. Where a number is an
assumption rather than a measurement, it says so.

## 1. The groove carries the signal sideways, not up and down

A record groove can be modulated two ways: **vertically**, where the depth of the floor follows the
waveform, or **laterally**, where the groove wanders left and right of a nominal spiral.

Vertical modulation is what the 2012 Ghassaei record does, and it is the obvious choice for a resin
printer with 16 µm layers. On an FDM printer it is the wrong choice, because Z is quantised to the
layer height. At 0.2 mm layers there are perhaps three or four distinct depths available inside a
groove, which is roughly two bits of amplitude resolution.

This engine modulates **laterally**. The groove's axis sits at

```
r(θ) = r_spiral(θ) + A · x(t(θ))
```

where `x` is the audio sample at that angle and `A` is the amplitude in millimetres. XY motion on a
printer is continuous, limited by the step resolution of the motors and the smoothing of the
firmware, not by the layer height. The amplitude resolution stops being a printer property and
becomes a question of how tightly the extruded bead can turn, which is section 3.

Lateral modulation is also what real mono records use, so a normal cartridge reads it correctly.

## 2. The groove is a stepped V trench

The first design put two extrusion beads side by side and used the valley between them as the
groove. Printed, the valley closed up: the beads merged into a single flat ridge. A groove has to
be an actual trench with a floor and walls.

```
    layer k=2   ▁▁▁▁▁▁        ▁▁▁▁▁▁        each wall layer steps
    layer k=1     ▁▁▁▁▁    ▁▁▁▁▁           outward by wallStepMm,
    layer k=0       ▁▁▁▁  ▁▁▁▁             so the trench widens with
    base            ████████████           depth like a stylus cone
                        ↑
                  grooveGapMm (the floor)
```

- `baseLayers` of solid disc first. Their top face is the floor of the trench.
- `wallLayers` layers above that, each a pair of beads (outer and inner wall), the pair spaced
  `grooveGapMm + 2·k·wallStepMm` apart in layer `k`.
- Between neighbouring turns, a **land** bead fills the ridge. Its width varies segment by segment,
  because the gap between two turns changes with the difference in signal between them.
- Both beads of a pair carry the same `A · x(t)`, so the whole trench moves sideways together.

The land is deliberately left slightly **under** filled (`LAND_BITE = -0.06`). An under filled land
is harmless; an over filled one squeezes plastic into the groove and fills it in.

The pitch, that is the spacing between turns, follows from the geometry:

```
pitch = 2·beadWidth + grooveGap + 2·amplitude + landMin
```

With the measured 0.4 mm values that is 1.73 mm. A real microgroove LP is at about 0.1 mm, so this
is roughly 17 times coarser, which is the honest size of the gap between this and vinyl.

## 3. The curvature limit is the whole ball game

An extruded bead cannot follow an arbitrarily tight curve. Below some radius of curvature the
material simply smears across the corner, and in a groove that means the wall bulges into the
channel and buries it. The first tuning disc died exactly this way: its multitone contained
wavelengths shorter than the bead, and the grooves printed themselves shut.

For a sine of amplitude `A` and wavelength `L`, the radius of curvature at the peak is

```
R_min = L² / (4π²A)
```

Requiring `R_min ≥ minCurvature` gives a highest usable frequency at each radius:

```
f_max(r) = v(r) / (2π·√(minCurvature · A)),   v(r) = 2π·r·rpm/60
```

`minCurvature = 0.17 mm` is **measured**, not assumed. A disc printed at 45 rpm with A = 0.15 mm
fell off a cliff at 540 Hz at a radius of 115 mm, which is precisely where its path curvature
reaches 0.17 mm. Playing it back and measuring gave 470 Hz at −19 dB and 680 Hz at −37 dB, against
a predicted cliff at 540 Hz.

Two consequences worth internalising:

- **Amplitude costs bandwidth.** Doubling `A` needs a wave 41% longer, so it lowers `f_max` by 29%.
  An earlier version of this model looked only at wavelength, ignored amplitude, and happily
  produced paths the nozzle could not draw.
- **Bandwidth falls as the groove spirals inward,** because `v(r)` does. A disc is brighter at the
  rim than at the label, and that is physics, not a bug. `src/audio/prepare.ts` therefore applies a
  **time varying** lowpass: the signal is processed in 0.5 s blocks and each block is filtered at
  the ceiling for the radius where it will land.

For a 0.2 mm nozzle every groove dimension scales with extrusion width, and `minCurvature` is
scaled in proportion to 0.089 mm. That part is an assumption, not a measurement.

## 4. What fits on a disc

Capacity is `turns · 60 / rpm`, and turns is the usable radial band divided by the pitch. Both
tables are computed by the code in `src/record/layout.ts`; `npm run cli` prints them for any
configuration.

Nozzle 0.4 mm, pitch 1.73 mm:

| Disc | 78 rpm | 45 rpm | 33⅓ rpm |
|---|---|---|---|
| 250 mm | 27 s, 1200→558 Hz | 47 s, 692→322 Hz | 63 s, 512→238 Hz |
| 200 mm | 15 s, 967→558 Hz | 27 s, 558→322 Hz | 36 s, 413→238 Hz |
| 170 mm | 9 s, 818→558 Hz | 16 s, 472→322 Hz | 22 s, 349→238 Hz |

Nozzle 0.2 mm, pitch 1.06 mm:

| Disc | 78 rpm | 45 rpm | 33⅓ rpm |
|---|---|---|---|
| 250 mm | 45 s, 2170→996 Hz | 77 s, 1252→575 Hz | 105 s, 927→425 Hz |
| 200 mm | 26 s, 1726→996 Hz | 45 s, 996→575 Hz | 61 s, 737→425 Hz |
| 170 mm | 15 s, 1459→996 Hz | 27 s, 842→575 Hz | 36 s, 623→425 Hz |

The pattern: **speed buys bandwidth and costs length.** 78 rpm is 2.3 times brighter than 33⅓ and
holds 2.3 times less. At 33⅓ the band ends around 425 Hz, below most of a singing voice, which is
what people mean when they say a printed record sounds like it is playing in the next room.

## 5. Making it sound less muffled

The mechanical response falls with frequency, measured at −18 dB at 100 Hz and −22 dB at 470 Hz on
a real playback. Three things fight that, all in `src/audio/prepare.ts`:

- A **presence shelf** placed just below the band ceiling, so it lifts what will still get through
  rather than what is about to be filtered out. It travels inward with the ceiling.
- A **highpass at 150 Hz**. Bass costs amplitude, and amplitude costs bandwidth (section 3), so
  spending excursion on frequencies the groove reproduces badly is a poor trade.
- **Compression**, which lifts quiet passages above the constant surface noise of the print.

Measured effect on one track: the ratio of vocal band to bass band energy went from 4.6 dB to
9.1 dB at 45 rpm. Normalisation is done on a percentile rather than the peak, because a single
filter overshoot at the start of a track would otherwise cost half the amplitude of everything
after it.

RIAA pre-emphasis is applied before cutting and undone by the phono preamp on playback, as with a
real record.

## 6. Print details that turned out to matter

- **`G90` before `M83`.** In Marlin, and in Bambu's firmware, `G90` sets absolute mode for every
  axis including E. Emitting `M83` first meant the relative per segment extrusions were treated as
  absolute, so the printer advanced 0.025 mm of filament once and then never extruded again. The
  first print came out as a nozzle politely tracing a disc in mid air. There is a regression test.
- **Bed levelling area.** A slicer writes `G29 A X Y I J` for the bounding box of the object it
  sliced. A template made from a 10 mm cube probes 1 cm² in the middle of the bed, and outside that
  square the firmware is guessing the bed height, across a 25 cm disc. `patchLevelingArea` replaces
  it with the disc's own bounding box.
- **Layer markers.** Without `M73 L`, `M991`, `; CHANGE_LAYER` and the Z in travel pattern, Bambu
  Studio's preview draws every layer on top of the first one, even though Z really does rise.
- **Scattered seams.** Every wall and every layer starts at a different angle, offset by the golden
  ratio. When all the starts lined up on one radius they formed a ridge, and the stylus hit it once
  per revolution.
- **Wipe on retract.** Ending a path leaves a blob. In a groove, the stylus finds it.
- **Base layers can be thicker than groove layers.** The base is a plain slab, so printing it at a
  0.08 mm groove layer height doubled the print time for nothing. The first layer stays thin for
  adhesion.
- **The spindle hole.** The hole perimeter and the start of the base spiral overlapped, the surplus
  plastic went into the hole, and a 7.5 mm hole came out around 6 mm. They are now separated by one
  bead, with an elephant foot allowance on the first layer.

## 7. Tuning to your turntable

Every cartridge, preamp and platter has its own response, so the engine can measure yours:

1. `calib` prints a disc of multitone blocks, 1.2 s of eight tones and a 0.3 s gap, repeating to
   the label. Each block lands at a different radius.
2. You play it and record the output over USB.
3. `calibrate` aligns the recording against the reference by envelope correlation, measures every
   tone in every block against what should have been heard, and fits level against radius.
4. The result is a radius dependent EQ correction, applied to later tracks by a FIR filter before
   they are cut.

Three decisions in there are worth knowing about, because two of them were wrong first:

- The reference is the signal **before** RIAA pre-emphasis. When it was the groove content, the
  correction treated the entire RIAA curve as distortion.
- The anchor is the **median of the usable band** at that radius, not one chosen frequency. With
  470 Hz as the anchor, a frequency sitting at the edge of the band skewed the whole profile.
- Frequencies above the physical ceiling, and tones lost in the noise, get a correction of zero.
  Boosting what the bead cannot draw only raises the noise floor.

A turntable running 1% fast shifts the twentieth block by 0.3 s, enough that the measurement window
lands in a gap, so the speed ratio is estimated from the early blocks and the timebase corrected.

## 8. Two output formats

**G-code** is the primary path. The spiral is one continuous extrusion path, written directly, with
no mesh and no slicer in between. A whole disc is a few MB. The trade is that you are printing
machine written G-code, which is why the engine takes your printer's own start and end blocks from
a template rather than inventing them.

**3MF** is the other path: a watertight solid you slice yourself. Nothing bypasses your own printer
profile, and you can inspect it first. The cost is resolution. A slicer needs at least two
extrusion paths in the land between grooves, so the groove has to be about 1.6 mm wide at the top
instead of 0.55 mm, and a disc holds proportionally less music. `Mesh.checkManifold` enforces
watertightness by edge parity; the only degenerate faces left are the ones the step of a spiral
forces to exist.

## 9. What this will never be

A 0.4 mm extrusion is around ten times coarser than a cut groove, and the surface noise is audible
throughout. The band ends between 425 and 2200 Hz depending on nozzle, speed and radius. You get
melody and voice; you do not get cymbals, and you do not get bass.

PLA is also softer than vinyl and wears a stylus faster than vinyl does. Use a cheap cartridge with
a replaceable needle, and treat the needle as a consumable.
