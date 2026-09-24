# Which music you may cut

This is not legal advice. It is a summary of US and EU copyright as of 2026, written to explain
why the built in tune library exists. Check with a lawyer before you do anything commercial.

## The two rights everybody forgets

Every piece of recorded music carries **two independent copyrights**:

1. **The composition**: the melody and the lyrics. Protected for the author's life plus 70 years
   in the EU, or 95 years from publication in the US for works published before 1978.
2. **The sound recording**: one particular performance captured on tape. Protected separately.

To cut a record from somebody else's recording you need **both**. To cut a record from a melody
you synthesise yourself from notes, you only need **the first**. That is the gap the built in tune
library lives in: the melodies here are generated from note sequences in `src/audio/melody.ts`, so
no recording is copied, hosted or distributed.

## Where the line sits in 2026

### United States

| What | Public domain through |
|---|---|
| Compositions published | **1930** (95 years) |
| Sound recordings published | **1925** (Music Modernization Act, 100 years) |

The Music Modernization Act of 2018 created a public domain for sound recordings in the US for
the first time. Recordings from 1923 to 1946 are protected for 100 years from publication, so on
1 January 2026 the 1925 vintage entered the public domain, including Bessie Smith's "St. Louis
Blues" with Louis Armstrong. Another year arrives every 1 January.

### European Union

| What | Public domain through |
|---|---|
| Compositions | author died in **1955** or earlier (70 years after death) |
| Sound recordings | published in **1955** or earlier (70 years from publication) |

The two do not line up: a 1930 recording is free in the EU and still protected in the US. If you
publish anything for a US audience, use the US line, which is stricter for recordings.

## The built in library

| Tune | Origin | Status |
|---|---|---|
| Korobeiniki (the Tetris theme) | Russian folk song, 1861 | public domain everywhere |
| The Entertainer | Scott Joplin, 1902 (died 1917) | public domain everywhere |
| Ode to Joy | Beethoven, 1824 | public domain everywhere |
| Für Elise | Beethoven, 1810 | public domain everywhere |
| Greensleeves | English traditional, 16th century | public domain everywhere |
| Amazing Grace | lyrics 1779, melody "New Britain" 1835 | public domain everywhere |
| When the Saints Go Marching In | American traditional, 19th century | public domain everywhere |
| Auld Lang Syne | Scots traditional, printed 1799 | public domain everywhere |
| Happy Birthday | melody 1893 | public domain in the US since the 2016 settlement |

One caveat on Tetris: what this repository synthesises is the folk song **Korobeiniki**, not
Nintendo's 1989 arrangement. That arrangement has its own copyright. The version here is the plain
melody from notes.

## Safe ways to extend the library

**Classical, composers who died before 1956:** Bach, Mozart, Vivaldi (The Four Seasons), Chopin,
Tchaikovsky (The Nutcracker), Debussy (Clair de lune, died 1918), Satie (Gymnopédie, died 1925),
Joplin (Maple Leaf Rag), Sousa (Stars and Stripes Forever, published 1896), Elgar (died 1934),
Holst (The Planets, died 1934), Rachmaninoff (died 1943), and Gershwin's Rhapsody in Blue, which
has been public domain in the US since 2020.

**Traditional and folk:** House of the Rising Sun, Danny Boy (the Londonderry Air melody, 1855),
Scarborough Fair, Oh! Susanna and the rest of Stephen Foster (died 1864), Yankee Doodle,
Shenandoah, Wayfaring Stranger, La Cucaracha, and carols (Silent Night 1818, Jingle Bells 1857,
Carol of the Bells 1914).

## What is not allowed

- Any particular recording published after 1925 in the US, even when the composition itself is
  free. Rhapsody in Blue as performed in 1950 is still somebody's recording.
- Arrangements. A new arrangement of a folk tune carries its own copyright.
- Samples and covers taken from streaming services.
- Anything labelled "royalty free" without reading the licence. That is not the public domain.

## Your own music

Nothing stops you from cutting a record of your own music, or of a file you have the rights to.
The engine runs entirely on your machine: the audio is decoded in your browser or by your local
ffmpeg, and no file is uploaded anywhere, because there is no server in this project. What you do
with a disc you cut is between you and the rights holder.

## Sources

- Duke Center for the Study of the Public Domain, Public Domain Day 2026
- Music Modernization Act (2018), title II (the CLASSICS Act)
- Discography of American Historical Recordings, Public Domain Day 2026
