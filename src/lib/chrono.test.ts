import { describe, expect, it } from 'vitest';
import { RIFT_SETS, ROUNDS, checkOrder, pickRounds, scramble, shuffle, swap } from './chrono.ts';

const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

describe('Chrono-Rift', () => {
  it('has enough sets, each with 4 or 5 distinct steps', () => {
    expect(RIFT_SETS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(RIFT_SETS.map((x) => x.id)).size).toBe(RIFT_SETS.length);
    for (const set of RIFT_SETS) {
      expect(set.steps.length).toBeGreaterThanOrEqual(4);
      expect(set.steps.length).toBeLessThanOrEqual(5);
      expect(new Set(set.steps.map((x) => x.text)).size).toBe(set.steps.length);
      expect(set.title.length).toBeGreaterThan(5);
    }
  });

  it('keeps history events in true order by their years', () => {
    const year = (w?: string) => { const m = /(\d+)(?: BC)?/.exec(w ?? ''); const bc = (w ?? '').includes('BC'); return m ? (bc ? -1 : 1) * Number(m[1]) : NaN; };
    for (const set of RIFT_SETS.filter((x) => x.subject === 'history' && x.steps.every((st) => st.when))) {
      const years = set.steps.map((st) => year(st.when));
      expect(years, set.id).toEqual([...years].sort((a, b) => a - b));
    }
  });

  it('scrambles so the order is never already right', () => {
    for (let seed = 1; seed < 60; seed++) {
      for (const n of [4, 5]) {
        const o = scramble(n, seeded(seed));
        expect([...o].sort()).toEqual(Array.from({ length: n }, (_, i) => i));
        expect(checkOrder(o).every(Boolean)).toBe(false);
      }
    }
  });

  it('picks a mix of subjects with no repeats', () => {
    const rounds = pickRounds(ROUNDS, seeded(7));
    expect(rounds).toHaveLength(ROUNDS);
    expect(new Set(rounds.map((r) => r.id)).size).toBe(ROUNDS);
    expect(rounds.some((r) => r.subject === 'science') && rounds.some((r) => r.subject === 'history')).toBe(true);
  });

  it('swaps cards but never moves a locked one', () => {
    expect(swap([2, 0, 1], 0, 1)).toEqual([0, 2, 1]);
    expect(swap([0, 2, 1], 0, 2, [true, false, false])).toEqual([0, 2, 1]);
    expect(swap([0, 2, 1], 1, 1)).toEqual([0, 2, 1]);
    expect(checkOrder([0, 2, 1])).toEqual([true, false, false]);
    expect(shuffle([1, 2, 3], seeded(3)).sort()).toEqual([1, 2, 3]);
  });
});
