import { describe, expect, it } from 'vitest';
import { DRAWING_WORDS, PEN_COLORS, isRightGuess, maskWord, scribble } from './drawing-rules.ts';

describe('drawing rules', () => {
  it('accepts the word with spaces, case and a plural s ignored', () => {
    expect(isRightGuess('Ice  Cream', 'ice cream')).toBe(true);
    expect(isRightGuess('icecream', 'ice cream')).toBe(true);
    expect(isRightGuess('cats', 'cat')).toBe(true);
    expect(isRightGuess('dog', 'cat')).toBe(false);
  });
  it('shows blanks and reveals only the first letter on request', () => {
    expect(maskWord('ice cream', false)).toBe('___ _____');
    expect(maskWord('cat', true)).toBe('c__');
  });
  it('has no duplicate words and bot scribbles stay on the page', () => {
    expect(new Set(DRAWING_WORDS).size).toBe(DRAWING_WORDS.length);
    for (const s of scribble(7)) {
      expect(PEN_COLORS).toContain(s.c);
      for (const [x, y] of s.p) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1000); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(1000); }
    }
  });
});
