import { describe, expect, it } from 'vitest';
import { judgeTap, stars, sweepMisses, type Note } from './rhythm.ts';
import { LIBRARY, LEVELS, beatMap, noteMidi, parseSong, songLength } from './songs.ts';

const sample = (): Note[] => [0, 1, 2, 0].map((lane, i) => ({ lane, time: 2 + i * 0.5, result: null }));

describe('rhythm rules', () => {
  it('judges taps by how close they are, in the right lane only', () => {
    const notes = sample();
    const first = notes[0];
    expect(judgeTap(notes, (first.lane + 1) % 3, first.time)).toBeNull();
    expect(judgeTap(notes, first.lane, first.time + 0.15)).toBe('good');
    expect(first.result).toBe('good');
    expect(judgeTap(notes, first.lane, first.time)).toBeNull();
    const second = notes[1];
    expect(judgeTap(notes, second.lane, second.time + 0.02)).toBe('perfect');
  });

  it('marks late notes missed and scores stars', () => {
    const notes = sample();
    expect(sweepMisses(notes, 999)).toBe(notes.length);
    expect(stars(notes)).toBe(1);
    notes.forEach((n) => { n.result = 'perfect'; });
    expect(stars(notes)).toBe(3);
  });
});

describe('song library', () => {
  it('has 15 songs, each with a source and a free license', () => {
    expect(LIBRARY).toHaveLength(15);
    expect(new Set(LIBRARY.map((s) => s.id)).size).toBe(15);
    for (const s of LIBRARY) {
      expect(s.by.length).toBeGreaterThan(3);
      expect(['Public domain', 'CC0 (made for HAHN Heroes)']).toContain(s.license);
    }
  });

  it('every bar adds up and every song has a chord for each bar', () => {
    for (const s of LIBRARY) expect(() => parseSong(s)).not.toThrow();
  });

  it('reads note names', () => {
    expect(noteMidi('C4')).toBe(60);
    expect(noteMidi('A4')).toBe(69);
    expect(noteMidi('F#4')).toBe(66);
    expect(noteMidi('A#3')).toBe(58);
  });

  it('makes a playable beat map on every level, easy having the fewest notes', () => {
    for (const s of LIBRARY) {
      const song = parseSong(s);
      const counts = LEVELS.map((l) => beatMap(song, l.id).length);
      expect(counts[0]).toBeGreaterThanOrEqual(12);
      expect(counts[0]).toBeLessThanOrEqual(counts[1]);
      expect(counts[1]).toBeLessThanOrEqual(counts[2]);
      for (const l of LEVELS) {
        const notes = beatMap(song, l.id);
        const gap = { easy: 0.55, medium: 0.3, hard: 0.15 }[l.id];
        notes.forEach((n, i) => {
          expect(n.lane).toBeGreaterThanOrEqual(0);
          expect(n.lane).toBeLessThanOrEqual(2);
          if (i) expect(n.time - notes[i - 1].time).toBeGreaterThanOrEqual(gap - 1e-9);
        });
      }
      expect(songLength(song)).toBeGreaterThan(20);
      expect(songLength(song)).toBeLessThan(120);
    }
  });

  it('uses all three lanes on every song', () => {
    for (const s of LIBRARY) expect(new Set(beatMap(parseSong(s), 'hard').map((n) => n.lane)).size).toBe(3);
  });
});
