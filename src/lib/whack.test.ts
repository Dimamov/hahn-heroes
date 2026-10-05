import { describe, expect, it } from 'vitest';
import { WHACK_HOLES, dwellMs, nextPop, whackScore } from './whack.ts';

describe('whack-a-shadow rules', () => {
  it('never repeats the same hole and keeps holes in range', () => {
    let p = nextPop(null, Math.random);
    for (let i = 0; i < 500; i++) {
      const n = nextPop(p, Math.random);
      expect(n.hole).not.toBe(p.hole);
      expect(n.hole).toBeGreaterThanOrEqual(0);
      expect(n.hole).toBeLessThan(WHACK_HOLES);
      p = n;
    }
  });
  it('scores shadows and takes a point back for a Nexling, never below zero', () => {
    expect(whackScore(3, 'shadow')).toBe(4);
    expect(whackScore(3, 'nexling')).toBe(2);
    expect(whackScore(0, 'nexling')).toBe(0);
  });
  it('speeds up but never below 550 ms', () => {
    expect(dwellMs(0)).toBe(1000);
    expect(dwellMs(30)).toBe(550);
  });
});
