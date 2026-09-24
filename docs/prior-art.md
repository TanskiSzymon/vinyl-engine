# Prior art

This project stands on two pieces of published work, plus one thread of hobbyist prints. None of
their code is used here, but the numbers they published saved months of guessing, so they deserve
the credit.

## Amanda Ghassaei, "3D Printed Record" (2012)

<https://www.instructables.com/3D-Printed-Record/>

The original demonstration that an FDM or resin printed disc can play on an ordinary turntable.
Ghassaei wrote a Processing program that reads raw audio, sets the height of a spiral groove floor
from the waveform, and exports an STL. The records were printed on an Objet Connex500 at 600 dpi
in XY and 16 µm in Z, ran at 33 rpm, and came out at roughly 11 kHz sample rate and 5 to 6 bit
resolution.

What this project takes from it:

- **Groove geometry in numbers.** A microgroove record has a groove about 1.4 mil (35 µm) wide at
  the stylus contact and 1.1 mil (28 µm) deep, while a 78 is about three times coarser in every
  dimension. That is the target a 0.4 mm nozzle is being compared against, and it is why the
  honest answer about quality is "an order of magnitude coarser than a real record".
- **The idea that audio survives abuse.** Amplify, compress, clip a little: recognition survives
  far more damage than fidelity does. The soft limiter and the compressor in `src/audio/prepare.ts`
  exist because of this observation.
- **A matrix test disc.** Print many closed rings, each with different parameters and a different
  whole number of cycles per revolution, play the disc once, and read off which combination works
  from the pitch of each ring. That is `src/programs.ts` and the `matrix` command.

The important difference: Ghassaei modulates the groove **vertically**, in Z, which on an FDM
printer is quantised to the layer height. This project modulates **radially**, in XY, where motion
is continuous. See `docs/how-it-works.md`.

## Phewalts, r/3Dprinting (2026)

A widely shared post of a playable record printed on a Bambu Lab printer with a 0.2 mm nozzle. The
published 3MF was measured to check whether the groove shape here was plausible: a 1.96 mm pitch,
0.76 mm deep, a 0.42 mm floor and walls at about 50 degrees. Those measurements are why the groove
in this project is a stepped V trench rather than the cusp between two beads, which merged into a
flat ridge when it was printed.

## Real record engineering

- The RIAA pre-emphasis and playback curves, including the 3.18 µs Neumann pole, implemented in
  `src/audio/riaa.ts`.
- Constant linear velocity is what a cutting lathe would like and what a turntable does not do: a
  disc spins at constant angular speed, so the outer groove passes the stylus two to three times
  faster than the inner one. Everything in this project that varies with radius, from the band
  ceiling to the calibration profile, follows from that single fact.
