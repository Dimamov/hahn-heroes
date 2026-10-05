import { describe, expect, it } from 'vitest';
import { SONGS, judgeTap, notesFor, stars, sweepMisses } from './rhythm.ts';

describe('rhythm rules', () => {
  it('every song uses only lanes 0 to 2 and has notes', () => {
    for (const s of SONGS) {
      expect(s.pattern).toMatch(/^[0-2.]+$/);
      expect(notesFor(s).length).toBeGreaterThan(8);
    }
  });

  it('judges taps by how close they are, in the right lane only', () => {
    const notes = notesFor(SONGS[0]);
    const first = notes[0];
    expect(judgeTap(notes, (first.lane + 1) % 3, first.time)).toBeNull();
    expect(judgeTap(notes, first.lane, first.time + 0.15)).toBe('good');
    expect(first.result).toBe('good');
    expect(judgeTap(notes, first.lane, first.time)).toBeNull();
    const second = notes[1];
    expect(judgeTap(notes, second.lane, second.time + 0.02)).toBe('perfect');
  });

  it('marks late notes missed and scores stars', () => {
    const notes = notesFor(SONGS[0]);
    expect(sweepMisses(notes, 999)).toBe(notes.length);
    expect(stars(notes)).toBe(1);
    notes.forEach((n) => { n.result = 'perfect'; });
    expect(stars(notes)).toBe(3);
  });
});
