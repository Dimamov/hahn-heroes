// Rhythm Tap songs. Each is a melody written out as notes (so there are no audio files to download, and the
// beat map always matches the music exactly). Classical and folk tunes are public domain; the "hero" tracks were
// composed for HAHN Heroes and dedicated to the public domain (CC0). See CREDITS.md.
//
// Melody notation: bars are separated by "|"; each note is NAME:BEATS, like C4:1 or F#4:0.5; "r" is a rest.
// Chords: one root note name per bar (used for the bass line).
export type Level = 'easy' | 'medium' | 'hard';
export const LEVELS: { id: Level; label: string }[] = [
  { id: 'easy', label: 'Easy' }, { id: 'medium', label: 'Medium' }, { id: 'hard', label: 'Hard' },
];

export interface SongDef {
  id: string; name: string; icon: string; by: string; license: 'Public domain' | 'CC0 (made for HAHN Heroes)';
  bpm: number; beatsPerBar: number; repeat: number; melody: string; chords: string;
}

const T = '0.3333333';

export const LIBRARY: SongDef[] = [
  { id: 'mary', name: 'Mary Had a Little Lamb', icon: '🐑', by: 'Traditional (1830)', license: 'Public domain', bpm: 100, beatsPerBar: 4, repeat: 2,
    melody: 'E4:1 D4:1 C4:1 D4:1 | E4:1 E4:1 E4:2 | D4:1 D4:1 D4:2 | E4:1 G4:1 G4:2 | E4:1 D4:1 C4:1 D4:1 | E4:1 E4:1 E4:1 E4:1 | D4:1 D4:1 E4:1 D4:1 | C4:4',
    chords: 'C C G C C C G C' },
  { id: 'twinkle', name: 'Twinkle, Twinkle', icon: '⭐', by: 'French folk tune, Mozart variations (1781)', license: 'Public domain', bpm: 104, beatsPerBar: 4, repeat: 1,
    melody: 'C4:1 C4:1 G4:1 G4:1 | A4:1 A4:1 G4:2 | F4:1 F4:1 E4:1 E4:1 | D4:1 D4:1 C4:2 | G4:1 G4:1 F4:1 F4:1 | E4:1 E4:1 D4:2 | G4:1 G4:1 F4:1 F4:1 | E4:1 E4:1 D4:2 | C4:1 C4:1 G4:1 G4:1 | A4:1 A4:1 G4:2 | F4:1 F4:1 E4:1 E4:1 | D4:1 D4:1 C4:2',
    chords: 'C F F C C C C G C F F C' },
  { id: 'row', name: 'Row Your Boat', icon: '🚣', by: 'Traditional (1852)', license: 'Public domain', bpm: 100, beatsPerBar: 4, repeat: 4,
    melody: `C4:1 C4:1 C4:0.75 D4:0.25 E4:1 | E4:0.75 D4:0.25 E4:0.75 F4:0.25 G4:2 | C5:${T} C5:${T} C5:${T} G4:${T} G4:${T} G4:${T} E4:${T} E4:${T} E4:${T} C4:${T} C4:${T} C4:${T} | G4:0.75 F4:0.25 E4:0.75 D4:0.25 C4:2`,
    chords: 'C C C G' },
  { id: 'frere', name: 'Frère Jacques', icon: '🔔', by: 'Traditional French (1700s)', license: 'Public domain', bpm: 108, beatsPerBar: 4, repeat: 2,
    melody: 'C4:1 D4:1 E4:1 C4:1 | C4:1 D4:1 E4:1 C4:1 | E4:1 F4:1 G4:2 | E4:1 F4:1 G4:2 | G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:1 C4:1 | G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:1 C4:1 | C4:1 G3:1 C4:2 | C4:1 G3:1 C4:2',
    chords: 'C C C G C C C C' },
  { id: 'macdonald', name: 'Old MacDonald', icon: '🐄', by: 'Traditional (1917 or earlier)', license: 'Public domain', bpm: 112, beatsPerBar: 4, repeat: 2,
    melody: 'C4:1 C4:1 C4:1 G3:1 | A3:1 A3:1 G3:2 | E4:1 E4:1 D4:1 D4:1 | C4:4 | C4:1 C4:1 C4:1 G3:1 | A3:1 A3:1 G3:2 | E4:1 E4:1 D4:1 D4:1 | C4:4',
    chords: 'C F G C C F G C' },
  { id: 'jingle', name: 'Jingle Bells', icon: '🛎️', by: 'James Lord Pierpont (1857)', license: 'Public domain', bpm: 128, beatsPerBar: 4, repeat: 1,
    melody: 'E4:1 E4:1 E4:2 | E4:1 E4:1 E4:2 | E4:1 G4:1 C4:1.5 D4:0.5 | E4:4 | F4:1 F4:1 F4:1.5 F4:0.5 | F4:1 E4:1 E4:1 E4:0.5 E4:0.5 | E4:1 D4:1 D4:1 E4:1 | D4:2 G4:2 | E4:1 E4:1 E4:2 | E4:1 E4:1 E4:2 | E4:1 G4:1 C4:1.5 D4:0.5 | E4:4 | F4:1 F4:1 F4:1.5 F4:0.5 | F4:1 E4:1 E4:1 E4:0.5 E4:0.5 | G4:1 G4:1 F4:1 D4:1 | C4:4',
    chords: 'C C C C F C G G C C C C F C G C' },
  { id: 'ode', name: 'Ode to Joy', icon: '🎶', by: 'Ludwig van Beethoven (1824)', license: 'Public domain', bpm: 108, beatsPerBar: 4, repeat: 1,
    melody: 'E4:1 E4:1 F4:1 G4:1 | G4:1 F4:1 E4:1 D4:1 | C4:1 C4:1 D4:1 E4:1 | E4:1.5 D4:0.5 D4:2 | E4:1 E4:1 F4:1 G4:1 | G4:1 F4:1 E4:1 D4:1 | C4:1 C4:1 D4:1 E4:1 | D4:1.5 C4:0.5 C4:2 | D4:1 D4:1 E4:1 C4:1 | D4:1 E4:0.5 F4:0.5 E4:1 C4:1 | D4:1 E4:0.5 F4:0.5 E4:1 D4:1 | C4:1 D4:1 G3:2 | E4:1 E4:1 F4:1 G4:1 | G4:1 F4:1 E4:1 D4:1 | C4:1 C4:1 D4:1 E4:1 | D4:1.5 C4:0.5 C4:2',
    chords: 'C C C G C C C C G C G G C C C C' },
  { id: 'grace', name: 'Amazing Grace', icon: '🕊️', by: 'Traditional hymn (1779)', license: 'Public domain', bpm: 96, beatsPerBar: 3, repeat: 1,
    melody: 'r:2 D4:1 | G4:2 B4:0.5 G4:0.5 | B4:2 A4:1 | G4:2 E4:1 | D4:2 D4:1 | G4:2 B4:0.5 G4:0.5 | B4:2 A4:1 | D5:3 | D5:2 B4:1 | D5:2 B4:0.5 G4:0.5 | E4:2 D4:1 | G4:2 B4:0.5 G4:0.5 | B4:2 A4:1 | G4:3',
    chords: 'G G G C G G G G G G C G D G' },
  { id: 'elise', name: 'Für Elise', icon: '🎹', by: 'Ludwig van Beethoven (1810)', license: 'Public domain', bpm: 150, beatsPerBar: 3, repeat: 2,
    melody: 'r:2 E5:0.5 D#5:0.5 | E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 | A4:1 r:0.5 C4:0.5 E4:0.5 A4:0.5 | B4:1 r:0.5 E4:0.5 G#4:0.5 B4:0.5 | C5:1 r:0.5 E4:0.5 E5:0.5 D#5:0.5 | E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 | A4:1 r:0.5 C4:0.5 E4:0.5 A4:0.5 | B4:1 r:0.5 E4:0.5 C5:0.5 B4:0.5 | A4:2 r:1',
    chords: 'A A A E A A A E A' },
  { id: 'fifth', name: 'Fifth Symphony', icon: '⚡', by: 'Ludwig van Beethoven (1808)', license: 'Public domain', bpm: 112, beatsPerBar: 4, repeat: 2,
    melody: 'r:0.5 G4:0.5 G4:0.5 G4:0.5 D#4:2 | r:0.5 F4:0.5 F4:0.5 F4:0.5 D4:2 | r:0.5 G#4:0.5 G#4:0.5 G#4:0.5 F4:2 | r:0.5 G4:0.5 G4:0.5 G4:0.5 D#4:2 | r:0.5 G4:0.5 G4:0.5 G4:0.5 D#4:2 | r:0.5 F4:0.5 F4:0.5 F4:0.5 D4:2 | r:0.5 G4:0.5 G4:0.5 G4:0.5 D#4:1 F4:1 | G4:4',
    chords: 'C G F C C G C C' },

  { id: 'hero', name: 'Hero Beat', icon: '🦸', by: 'Composed for HAHN Heroes', license: 'CC0 (made for HAHN Heroes)', bpm: 112, beatsPerBar: 4, repeat: 2,
    melody: 'E4:0.5 G4:0.5 C5:1 B4:0.5 G4:0.5 E4:1 | D4:0.5 G4:0.5 B4:1 A4:0.5 G4:0.5 D4:1 | E4:0.5 A4:0.5 C5:1 B4:0.5 A4:0.5 E4:1 | F4:0.5 A4:0.5 C5:0.5 A4:0.5 G4:2 | E4:0.5 G4:0.5 C5:1 D5:0.5 E5:0.5 C5:1 | D5:0.5 B4:0.5 G4:1 B4:0.5 D5:0.5 G5:1 | C5:0.5 A4:0.5 F4:1 A4:0.5 C5:0.5 F5:1 | E5:1 D5:1 C5:2',
    chords: 'C G A F C G F C' },
  { id: 'nexus', name: 'Nexus Rush', icon: '🚀', by: 'Composed for HAHN Heroes', license: 'CC0 (made for HAHN Heroes)', bpm: 128, beatsPerBar: 4, repeat: 2,
    melody: 'A3:0.5 A3:0.5 E4:0.5 A4:0.5 C5:1 A4:1 | G3:0.5 G3:0.5 D4:0.5 G4:0.5 B4:1 G4:1 | F3:0.5 F3:0.5 C4:0.5 F4:0.5 A4:1 F4:1 | E4:0.5 E4:0.5 G#4:0.5 B4:0.5 E5:2 | C5:0.5 B4:0.5 A4:0.5 B4:0.5 C5:1 E5:1 | D5:0.5 C5:0.5 B4:0.5 C5:0.5 D5:1 G5:1 | E5:0.5 D5:0.5 C5:0.5 B4:0.5 A4:1 C5:1 | B4:0.5 G#4:0.5 B4:0.5 E4:0.5 A4:2',
    chords: 'A G F E A G A E' },
  { id: 'shadow', name: 'Shadow Chase', icon: '🌑', by: 'Composed for HAHN Heroes', license: 'CC0 (made for HAHN Heroes)', bpm: 140, beatsPerBar: 4, repeat: 2,
    melody: 'D4:0.5 F4:0.5 A4:0.5 F4:0.5 D4:0.5 F4:0.5 A4:0.5 D5:0.5 | C5:0.5 A4:0.5 F4:0.5 A4:0.5 C5:1 A4:1 | A#3:0.5 D4:0.5 F4:0.5 D4:0.5 A#4:1 F4:1 | A3:0.5 C#4:0.5 E4:0.5 A4:0.5 G4:0.5 E4:0.5 C#4:0.5 A3:0.5 | D5:0.5 C5:0.5 A4:0.5 F4:0.5 D5:1 A4:1 | C5:0.5 A#4:0.5 G4:0.5 E4:0.5 C5:2 | A#4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:0.5 F4:0.5 G4:0.5 A4:0.5 | D4:1 A3:1 D4:2',
    chords: 'D D A# A D C G D' },
  { id: 'sky', name: 'Sky Dash', icon: '☁️', by: 'Composed for HAHN Heroes', license: 'CC0 (made for HAHN Heroes)', bpm: 120, beatsPerBar: 4, repeat: 2,
    melody: 'G4:1 B4:0.5 D5:0.5 G5:1 D5:1 | E5:1 C5:0.5 E5:0.5 G5:1 E5:1 | D5:1 B4:0.5 G4:0.5 A4:1 B4:1 | A4:0.5 B4:0.5 C5:0.5 B4:0.5 A4:2 | G4:1 B4:0.5 D5:0.5 B4:1 G4:1 | C5:0.5 D5:0.5 E5:1 D5:0.5 C5:0.5 B4:1 | A4:1 C5:0.5 E5:0.5 D5:1 B4:1 | G4:4',
    chords: 'G C G D G C D G' },
  { id: 'crystal', name: 'Crystal Cave', icon: '💎', by: 'Composed for HAHN Heroes', license: 'CC0 (made for HAHN Heroes)', bpm: 100, beatsPerBar: 4, repeat: 2,
    melody: 'E4:1 G4:1 B4:1 G4:1 | E5:1.5 D5:0.5 B4:2 | C5:1 E5:1 D5:1 B4:1 | A4:2 B4:1 G4:1 | E4:1 G4:1 B4:1 E5:1 | F#5:1.5 E5:0.5 D5:1 B4:1 | C5:0.5 D5:0.5 E5:1 D5:1 C5:1 | B4:2 E4:2',
    chords: 'E E C A E D C E' },
];

export interface SongEvent { midi: number; beat: number; beats: number }
export interface ParsedSong { def: SongDef; events: SongEvent[]; bars: number; totalBeats: number; roots: number[] }

const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function noteMidi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return 12 * (Number(m[3]) + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
function rootMidi(name: string): number {
  const m = /^([A-G])(#|b)?$/.exec(name);
  if (!m) throw new Error(`bad chord ${name}`);
  return 36 + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); // octave 2 for the bass
}

/** Reads a song's notation once. Throws if a bar does not add up, so a typo cannot ship. */
export function parseSong(def: SongDef): ParsedSong {
  const events: SongEvent[] = [];
  const bars = def.melody.split('|').map((b) => b.trim());
  const roots = def.chords.trim().split(/\s+/).map(rootMidi);
  if (roots.length !== bars.length) throw new Error(`${def.id}: ${bars.length} bars but ${roots.length} chords`);
  bars.forEach((bar, bi) => {
    let beat = bi * def.beatsPerBar;
    for (const tok of bar.split(/\s+/)) {
      const [n, d] = tok.split(':');
      const beats = Number(d);
      if (!(beats > 0)) throw new Error(`${def.id}: bad length in ${tok}`);
      if (n !== 'r') events.push({ midi: noteMidi(n), beat, beats });
      beat += beats;
    }
    if (Math.abs(beat - (bi + 1) * def.beatsPerBar) > 1e-3) throw new Error(`${def.id}: bar ${bi + 1} has ${beat - bi * def.beatsPerBar} beats`);
  });
  return { def, events, bars: bars.length, totalBeats: bars.length * def.beatsPerBar, roots };
}

const GAP: Record<Level, number> = { easy: 0.55, medium: 0.3, hard: 0.15 };
const GRID: Record<Level, number> = { easy: 1, medium: 0.5, hard: 0.25 };

/** The notes to tap, with times in seconds from the start of the song (plus `lead` seconds of count-in). */
export function beatMap(song: ParsedSong, level: Level, lead = 2): { lane: number; time: number; result: null }[] {
  const spb = 60 / song.def.bpm;
  const pitches = [...new Set(song.events.map((e) => e.midi))].sort((a, b) => a - b);
  const laneOf = (midi: number) => Math.min(2, Math.floor((pitches.indexOf(midi) * 3) / pitches.length));
  const out: { lane: number; time: number; result: null }[] = [];
  let last = -Infinity;
  for (let r = 0; r < song.def.repeat; r++) {
    for (const e of song.events) {
      const onGrid = Math.abs(e.beat / GRID[level] - Math.round(e.beat / GRID[level])) < 1e-6;
      if (!onGrid && !(level === 'easy' && e.beats >= 1)) continue;
      const time = lead + (r * song.totalBeats + e.beat) * spb;
      if (time - last < GAP[level]) continue;
      out.push({ lane: laneOf(e.midi), time, result: null });
      last = time;
    }
  }
  return out;
}

export function songLength(song: ParsedSong, lead = 2): number {
  return lead + song.totalBeats * song.def.repeat * (60 / song.def.bpm);
}
