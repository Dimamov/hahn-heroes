import { describe, expect, it } from 'vitest';
import { LOOP_MS, PAD_COUNT, cleanLoop, newHits, padInfo, padNumber, validPad, type Mate } from './jam.ts';

const mate = (seq: number, pads: number[]): Mate => ({ id: 'm1', name: 'Maya', seq, pads, live: true });

describe('jam', () => {
  it('numbers pads by kit and position', () => {
    expect(padInfo(0).label).toBe('Kick');
    expect(padInfo(padNumber(2, 7)).label).toBe('Power up');
    expect(validPad(PAD_COUNT)).toBe(false);
    expect(validPad(-1)).toBe(false);
    expect(validPad(23)).toBe(true);
  });
  it('keeps loop hits inside the loop, in order', () => {
    const out = cleanLoop([{ t: 500, pad: 3 }, { t: -1, pad: 2 }, { t: LOOP_MS, pad: 1 }, { t: 100, pad: 99 }, { t: 200, pad: 4 }]);
    expect(out.map((h) => h.pad)).toEqual([4, 3]);
  });
  it('plays only what a mate has added since the last poll', () => {
    const seen: Record<string, number> = {};
    expect(newHits(seen, [mate(10, [1, 2, 3])])).toEqual([]);
    expect(newHits(seen, [mate(10, [1, 2, 3])])).toEqual([]);
    const r = newHits(seen, [mate(12, [1, 2, 3, 4, 5])]);
    expect(r[0].pads).toEqual([4, 5]);
    const big = newHits(seen, [mate(40, [1, 2, 3, 4, 5, 6, 7, 8])]);
    expect(big[0].pads).toHaveLength(8);
  });
});
