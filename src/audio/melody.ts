// A synthetic test melody: "Korobeiniki" (the Tetris theme), a 19th century Russian folk song in
// public domain. Recognisable within three notes, which makes the "is it playing or hissing"
// test unambiguous.
// A tone is a sine plus its second harmonic under an envelope. Above 500 Hz the note amplitude
// falls as 1/f (constant velocity, as on a record) so the wave stays inside the wall's curvature
// limit.

const NOTE: Record<string, number> = {
  D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77, R: 0,
};

/** [note, length in quarter notes] */
export const KOROBEINIKI: [string, number][] = [
  ["E5", 1], ["B4", 0.5], ["C5", 0.5], ["D5", 1], ["C5", 0.5], ["B4", 0.5],
  ["A4", 1], ["A4", 0.5], ["C5", 0.5], ["E5", 1], ["D5", 0.5], ["C5", 0.5],
  ["B4", 1.5], ["C5", 0.5], ["D5", 1], ["E5", 1], ["C5", 1], ["A4", 1], ["A4", 1], ["R", 1],
  ["R", 0.5], ["D5", 1], ["F5", 0.5], ["A5", 1], ["G5", 0.5], ["F5", 0.5],
  ["E5", 1.5], ["C5", 0.5], ["E5", 1], ["D5", 0.5], ["C5", 0.5], ["B4", 1], ["B4", 0.5], ["C5", 0.5],
  ["D5", 1], ["E5", 1], ["C5", 1], ["A4", 1], ["A4", 1], ["R", 1],
];

/**
 * A library of public domain melodies. Each entry is the COMPOSITION itself, and the audio is
 * synthesised here, so no recording rights are involved.
 * Dates: Joplin died in 1917, Beethoven in 1827, and the rest are folk melodies from the 19th
 * century or earlier.
 */
export type Tune = { id: string; title: string; note: string; bpm: number; notes: [string, number][] };

export const TUNES: Tune[] = [
  { id: "korobeiniki", title: "Korobeiniki (Tetris)", note: "Russian folk song, 1861", bpm: 144, notes: KOROBEINIKI },
  { id: "entertainer", title: "The Entertainer", note: "Scott Joplin, 1902", bpm: 150, notes: [
    ["D5", 0.5], ["E5", 0.5], ["C5", 0.5], ["A4", 1], ["B4", 0.5], ["G4", 1],
    ["D4", 0.25], ["E4", 0.25], ["F4", 0.25], ["D4", 0.25], ["E4", 0.5], ["C5", 0.5], ["A4", 1],
    ["D5", 0.5], ["E5", 0.5], ["C5", 0.5], ["A4", 1], ["B4", 0.5], ["G4", 1.5],
    ["D5", 0.5], ["E5", 0.5], ["C5", 0.5], ["A4", 1], ["B4", 0.5], ["D5", 0.5],
    ["C5", 0.5], ["A4", 0.5], ["D5", 0.5], ["C5", 0.5], ["A4", 1], ["R", 0.5],
  ] },
  { id: "ode", title: "Ode to Joy", note: "Beethoven, 1824", bpm: 120, notes: [
    ["E5", 1], ["E5", 1], ["F5", 1], ["G5", 1], ["G5", 1], ["F5", 1], ["E5", 1], ["D5", 1],
    ["C5", 1], ["C5", 1], ["D5", 1], ["E5", 1], ["E5", 1.5], ["D5", 0.5], ["D5", 2],
    ["E5", 1], ["E5", 1], ["F5", 1], ["G5", 1], ["G5", 1], ["F5", 1], ["E5", 1], ["D5", 1],
    ["C5", 1], ["C5", 1], ["D5", 1], ["E5", 1], ["D5", 1.5], ["C5", 0.5], ["C5", 2], ["R", 1],
  ] },
  { id: "greensleeves", title: "Greensleeves", note: "English traditional, 16th century", bpm: 108, notes: [
    ["A4", 1], ["C5", 1.5], ["D5", 0.5], ["E5", 1.5], ["F5", 0.5], ["E5", 1],
    ["D5", 1.5], ["B4", 0.5], ["G4", 1], ["A4", 1.5], ["B4", 0.5], ["C5", 1.5], ["A4", 0.5],
    ["A4", 1], ["G4", 0.5], ["A4", 0.5], ["B4", 1], ["G4", 1], ["E4", 2], ["R", 1],
  ] },
  { id: "happy-birthday", title: "Happy Birthday", note: "melody 1893, public domain in the US since 2016", bpm: 108, notes: [
    ["G4", 0.75], ["G4", 0.25], ["A4", 1], ["G4", 1], ["C5", 1], ["B4", 2],
    ["G4", 0.75], ["G4", 0.25], ["A4", 1], ["G4", 1], ["D5", 1], ["C5", 2],
    ["G4", 0.75], ["G4", 0.25], ["G5", 1], ["E5", 1], ["C5", 1], ["B4", 1], ["A4", 2],
    ["F5", 0.75], ["F5", 0.25], ["E5", 1], ["C5", 1], ["D5", 1], ["C5", 2], ["R", 1],
  ] },
  { id: "saints", title: "When the Saints Go Marching In", note: "American traditional, 19th century", bpm: 132, notes: [
    ["C5", 1], ["E5", 1], ["F5", 1], ["G5", 3], ["R", 1],
    ["C5", 1], ["E5", 1], ["F5", 1], ["G5", 3], ["R", 1],
    ["C5", 1], ["E5", 1], ["F5", 1], ["G5", 2], ["E5", 2], ["C5", 2], ["E5", 2], ["D5", 3], ["R", 1],
    ["E5", 1.5], ["E5", 0.5], ["D5", 2], ["C5", 2], ["C5", 1], ["E5", 1], ["G5", 2], ["G5", 1], ["F5", 3],
    ["E5", 2], ["F5", 1], ["G5", 2], ["E5", 2], ["C5", 2], ["D5", 2], ["C5", 4], ["R", 1],
  ] },
  { id: "auld-lang-syne", title: "Auld Lang Syne", note: "Scots traditional, printed 1799", bpm: 96, notes: [
    ["C5", 1], ["F5", 1.5], ["E5", 0.5], ["F5", 1], ["A5", 1], ["G5", 1.5], ["F5", 0.5],
    ["G5", 1], ["A5", 1], ["G5", 1], ["F5", 1], ["F5", 1], ["A5", 1], ["C5", 2],
    ["D5", 1], ["C5", 1], ["A5", 1], ["A5", 1], ["F5", 1], ["G5", 1], ["A5", 1], ["G5", 1],
    ["F5", 1], ["G5", 1], ["E5", 1], ["F5", 2], ["R", 1],
  ] },
  { id: "amazing", title: "Amazing Grace", note: "Lyrics 1779, melody 'New Britain' 1835", bpm: 92, notes: [
    ["D5", 1], ["G5", 2], ["B4", 0.5], ["G5", 1.5], ["F5", 1], ["G5", 2], ["E5", 1],
    ["D5", 3], ["D5", 1], ["G5", 2], ["B4", 0.5], ["G5", 1.5], ["F5", 1], ["G5", 3], ["R", 1],
  ] },
  { id: "fur-elise", title: "Fur Elise", note: "Beethoven, 1810", bpm: 132, notes: [
    ["E5", 0.5], ["D5", 0.5], ["E5", 0.5], ["D5", 0.5], ["E5", 0.5], ["B4", 0.5], ["D5", 0.5], ["C5", 0.5],
    ["A4", 1.5], ["R", 0.5], ["C5", 0.5], ["E4", 0.5], ["A4", 0.5], ["B4", 1.5], ["R", 0.5],
    ["E4", 0.5], ["G4", 0.5], ["B4", 0.5], ["C5", 1.5], ["R", 0.5], ["E4", 0.5],
    ["E5", 0.5], ["D5", 0.5], ["E5", 0.5], ["D5", 0.5], ["E5", 0.5], ["B4", 0.5], ["D5", 0.5], ["C5", 0.5],
    ["A4", 2], ["R", 1],
  ] },
];

export function tuneById(id: string): Tune {
  return TUNES.find((t) => t.id === id) ?? TUNES[0];
}

export type MelodyOpts = { bpm?: number; harmonic?: number; velocityKneeHz?: number };

/** Renders a note sequence into a buffer of the given length, looping and cutting at the end. */
export function renderMelody(fs: number, seconds: number, notes: [string, number][] = KOROBEINIKI, o: MelodyOpts = {}): Float32Array {
  const bpm = o.bpm ?? 144, harmonic = o.harmonic ?? 0.3, knee = o.velocityKneeHz ?? 500;
  const out = new Float32Array(Math.round(seconds * fs));
  const beat = 60 / bpm;
  let t0 = 0, i = 0;
  while (t0 < seconds) {
    const [name, len] = notes[i % notes.length];
    i += 1;
    const dur = len * beat;
    const f = NOTE[name] ?? 0;
    if (f > 0) {
      const amp = f > knee ? knee / f : 1;              // stala predkosc powyzej kolana
      const n0 = Math.round(t0 * fs), n1 = Math.min(out.length, Math.round((t0 + dur * 0.92) * fs));
      const attack = Math.round(0.008 * fs), release = Math.round(0.02 * fs);
      for (let n = n0; n < n1; n += 1) {
        const k = n - n0, rem = n1 - n;
        let env = 1;
        if (k < attack) env = k / attack;
        else if (rem < release) env = rem / release;
        else env = 1 - 0.35 * (k / (n1 - n0));           // a gentle decay, like a plucked string
        const ph = (2 * Math.PI * f * k) / fs;
        out[n] = amp * env * (Math.sin(ph) + harmonic * Math.sin(2 * ph)) / (1 + harmonic);
      }
    }
    t0 += dur;
  }
  return out;
}
