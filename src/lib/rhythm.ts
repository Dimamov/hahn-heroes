// Rhythm Tap rules: songs are lane patterns on a steady beat; each tap is judged against the note's time.
export interface Song { id: string; name: string; icon: string; bpm: number; pattern: string }

/** One character per half-beat: a lane number (0 to 2) or "." for a rest. */
export const SONGS: Song[] = [
  { id: 'warmup', name: 'Warm-up', icon: '🌱', bpm: 72, pattern: '0.1.2.1.0.1.2.1.0.0.1.1.2.2.1.0.' },
  { id: 'hero', name: 'Hero Beat', icon: '⭐', bpm: 90, pattern: '0.1.2.1.0.2.1.0.1.1.2.2.0.0.1.2.0.1.2.1.0.1.2.2.' },
  { id: 'nexus', name: 'Nexus Rush', icon: '🚀', bpm: 108, pattern: '0.1.2.0.1.2.0.1.2.1.0.1.2.1.0.1.0.2.1.2.0.1.1.2.0.2.1.0.2.1.0.1.2.' },
];

export const FALL_SECONDS = 1.6;
export const HIT_WINDOW = 0.2;
export const PERFECT_WINDOW = 0.09;

export interface Note { lane: number; time: number; result: 'perfect' | 'good' | 'miss' | null }

/** Turns a song into timed notes. `lead` is seconds before the first note. */
export function notesFor(song: Song, lead = 2): Note[] {
  const step = 60 / song.bpm / 2;
  const out: Note[] = [];
  [...song.pattern].forEach((c, i) => { if (c !== '.') out.push({ lane: Number(c), time: lead + i * step, result: null }); });
  return out;
}

/** Judges a tap in a lane at time `t`: marks the closest open note, or returns null for a stray tap. */
export function judgeTap(notes: Note[], lane: number, t: number): 'perfect' | 'good' | null {
  let best: Note | null = null;
  for (const n of notes) if (n.lane === lane && n.result === null && Math.abs(n.time - t) <= HIT_WINDOW && (!best || Math.abs(n.time - t) < Math.abs(best.time - t))) best = n;
  if (!best) return null;
  best.result = Math.abs(best.time - t) <= PERFECT_WINDOW ? 'perfect' : 'good';
  return best.result;
}

/** Marks notes that have passed their window as missed. Returns how many just became missed. */
export function sweepMisses(notes: Note[], t: number): number {
  let n = 0;
  for (const note of notes) if (note.result === null && t - note.time > HIT_WINDOW) { note.result = 'miss'; n += 1; }
  return n;
}

export function stars(notes: Note[]): number {
  const hit = notes.filter((n) => n.result === 'perfect' || n.result === 'good').length;
  const pct = notes.length ? hit / notes.length : 0;
  return pct >= 0.9 ? 3 : pct >= 0.7 ? 2 : 1;
}
