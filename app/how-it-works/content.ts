export const GUIDE = {
  title: "How it works",
  lead: "Five minutes of setup, then one to three hours of printing. Everything below happens on your own machine. There is no server: the page does the maths in your browser.",
  steps: [
    ["1 · What you need", "An FDM printer (the engine was developed on a Bambu Lab P1S, 0.4 and 0.2 mm nozzles), PLA, and a turntable that can spin 45 or 78 rpm. An inexpensive cartridge with a replaceable stylus, never your good one. PLA is softer than vinyl and wears a stylus faster. That is the whole shopping list."],
    ["2 · Give the engine your printer's fingerprint", "The engine does not know your printer's start-up routine: bed levelling, purge line, temperatures. So you hand it one file that contains all of it. In your slicer, drop in any small object, ideally a 10 mm cube, slice it with your normal profile (your printer, your nozzle, PLA, your build plate), then export the sliced plate as a .gcode.3mf file. Drop that file on the page. Only its first and last block are used. Everything in between is written by the engine. The repository ships ready made P1S templates in templates/ if you want to skip this step."],
    ["3 · Pick what to press", "Start with a test melody. It is a public-domain tune synthesised on the spot, so you can print without any file at all. Once that plays, switch to your own music: drop an mp3, click the waveform to choose the passage, and the engine cuts it to whatever the disc holds."],
    ["4 · Print it", "Download the .gcode.3mf and open it in your slicer, or send it straight to the printer. Watch the first layer. If the base looks patchy, stop and check bed adhesion before you spend three hours. If you would rather not print machine written G-code at all, switch the output to a 3MF model and slice it yourself."],
    ["5 · Play it", "Put the disc on the platter, set the speed the page shows, tracking force about 2 g, anti-skate 2. Lower the needle with the cueing lever onto the wide run-in groove at the edge. If the stylus skates across the surface instead of tracking, lift it immediately: that is a groove shape problem, and the amplitude and wall layer settings are where you fix it."],
    ["6 · Make it sound better", "Print the tuning record, play it while recording over USB, and upload the recording. The engine measures what your particular turntable and cartridge actually deliver at each radius, and corrects every later record for it."],
  ] as [string, string][],
  expectTitle: "What to expect, honestly",
  expect: [
    "This is a lo-fi novelty, not hi-fi. The bandwidth ends somewhere between 400 and 2200 Hz depending on nozzle, speed and radius, so you get melody and voice, not cymbals and bass.",
    "There is audible surface noise. A 0.4 mm extrusion is roughly ten times coarser than a cut groove.",
    "With a 0.4 mm nozzle a 250 mm disc holds about 27 seconds at 78 rpm or 47 seconds at 45 rpm. A 0.2 mm nozzle roughly doubles the bandwidth at the same length. That is physics, not a software limit.",
    "Only the Bambu P1S has been tested end to end. Other printers should work, since the engine only writes ordinary moves and extrusions, but check the preview and watch the first layer.",
    "PLA wears a stylus. Use a cheap cartridge and expect to replace the needle.",
  ],
} as const;
