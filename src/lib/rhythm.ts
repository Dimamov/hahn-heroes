// Rhythm Tap rules: each tap is judged against the time of the closest open note in its lane. Songs live in songs.ts.
export const FALL_SECONDS = 1.6;
export const HIT_WINDOW = 0.2;
export const PERFECT_WINDOW = 0.09;

export interface Note { lane: number; time: number; result: 'perfect' | 'good' | 'miss' | null }

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
