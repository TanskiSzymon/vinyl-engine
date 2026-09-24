# Instructions for an AI agent

This file is for a coding agent setting the project up for somebody, or generating a disc on their
behalf. If you are a human, [README.md](README.md) is the friendlier door.

Ask the user for anything marked **ask** below rather than guessing. Their answers change the file
you produce and a wrong guess costs them hours of printer time.

## What this project does

It converts audio into a spiral groove and writes the G-code that prints it, or a 3MF solid the
user slices themselves. The groove is modulated laterally (in XY), not vertically, and the highest
frequency it can carry depends on the nozzle, the speed and the radius. All computation is local;
there is no API and no account.

## Setup

```bash
node --version           # needs 22 or newer
ffmpeg -version          # needed only for the CLI to decode mp3/mp4
git clone https://github.com/TanskiSzymon/vinyl-engine
cd vinyl-engine
npm install
npm test                 # 113 tests; if these fail, stop and report, do not "fix" the engine
```

If ffmpeg is missing: `brew install ffmpeg` (macOS), `winget install Gyan.FFmpeg` (Windows),
`sudo apt install ffmpeg` (Debian or Ubuntu).

## What you need from the user

1. **ask** Which printer and nozzle. If they have a Bambu Lab P1S, use the template already in
   `templates/` (`bambu-p1s-0.4.gcode.3mf` or `bambu-p1s-0.2.gcode.3mf`) and skip step 2.
2. **ask** What to press: one of the built in public domain tunes (run `npm run cli` to list them)
   or their own audio file. Their own file needs a path.
3. **ask** How long they are willing to print. This is the real constraint: roughly 1.5 h for a
   170 mm disc, 3 h for 250 mm at 0.4 mm, 8 h for 250 mm at 0.2 mm.

## For any other printer, build a template first

The engine writes the body of the print, never the machine's own start-up and shutdown. Those come
from a file the user slices:

1. In their slicer, load a 10 mm cube.
2. Slice with the exact profile they will print the disc with: their printer, their nozzle, PLA,
   their build plate.
3. Export the sliced plate as `.gcode.3mf` (Bambu Studio: Export → Export plate sliced file).
4. Pass it as `--template <path>`.

Do not hand write a template and do not edit the start G-code yourself.

## Choosing the numbers

Speed buys bandwidth and costs playing time. Default to **78 rpm** unless the user wants a longer
disc, because at 33⅓ the band ends around 425 Hz, below most of a singing voice.

| Nozzle | Disc | 78 rpm | 45 rpm | 33⅓ rpm |
|---|---|---|---|---|
| 0.4 mm | 250 mm | 27 s, 1200→558 Hz | 47 s, 692→322 Hz | 63 s, 512→238 Hz |
| 0.4 mm | 200 mm | 15 s, 967→558 Hz | 27 s, 558→322 Hz | 36 s, 413→238 Hz |
| 0.2 mm | 250 mm | 45 s, 2170→996 Hz | 77 s, 1252→575 Hz | 105 s, 927→425 Hz |
| 0.2 mm | 200 mm | 26 s, 1726→996 Hz | 45 s, 996→575 Hz | 61 s, 737→425 Hz |

For a 0.2 mm nozzle pass `--nozzle 0.2`. That one flag sets the whole coherent profile (bead width,
layer height, groove depth, curvature threshold, speeds); changing only the width would produce a
groove the printer cannot draw.

Diameter must fit the bed with 6 mm to spare. A 250 mm disc needs a 256 mm bed.

## Generating

```bash
# a built in tune, the best first disc: no audio file, shortest print
npm run cli -- melody --template templates/bambu-p1s-0.4.gcode.3mf \
  --out out/first.gcode.3mf --tune entertainer --rpm 78 --diameter 200

# the user's own audio, picking the passage that fits
npm run cli -- generate "<their file>" --template <template> \
  --out out/record.gcode.3mf --rpm 78 --diameter 250 --start 43

# a 3MF solid instead, if they would rather slice it themselves
npm run cli -- model "<their file>" --out out/disc.3mf --rpm 45
```

Useful extras, all optional: `--text "LINE ONE|LINE TWO"` engraves a label, `--decor rings`
(or `spiral`, `star`, `rosette`, `waves`, `guilloche`, `sunburst`) puts a pattern in the middle,
`--color-change` pauses for a manual spool swap, `--ams-slot 1` does a real AMS toolchange, and
`--start` picks which part of a long track to cut. Run `npm run cli` for the full list; do not
invent flags.

The passage is trimmed automatically to what the disc holds, so `--start` is how you choose the
chorus instead of the intro.

## Check before you hand it over

The CLI prints the music length, turn count, estimated print time and file size. Then verify the
file agrees with the printer:

```bash
unzip -p out/record.gcode.3mf Metadata/plate_1.gcode | \
  grep -m4 -E "^; (nozzle_diameter|layer_height|total layer number|max_z_height)"
```

- `nozzle_diameter` must equal the nozzle that is physically installed, or the printer refuses the
  job.
- `total layer number` should be base plus wall layers, a single digit or low teens, not 1.
- If validation failed, the CLI exits with a list of reasons. Read them; they name the parameter.

## What to tell the user when you are done

- The estimated print time and that they should watch the first layer.
- The playback speed the disc was cut for, tracking force about 2 g, anti-skate 2, and that the
  needle goes down on the wide run-in groove at the edge.
- **Use a cheap cartridge.** PLA wears a stylus faster than vinyl does. This matters more than
  anything else in this file, because it is the only part that damages something expensive.
- The audio is lo-fi by nature: melody and voice, no cymbals, no bass, with audible surface noise.

## Do not

- Do not modify the engine to make a validation error go away. The validator encodes measured
  physical limits; if it rejects the geometry, the print would fail.
- Do not upload the user's audio anywhere. Everything here runs locally and that is deliberate.
- Do not promise fidelity. See "What this will never be" in the README.

## If you want to understand it

[docs/how-it-works.md](docs/how-it-works.md) has the physics, the measurements and the failures
that produced the current design. `src/record/layout.ts` is where every parameter and every limit
lives, and it is the file to read first.
