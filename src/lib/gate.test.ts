import { describe, expect, it } from 'vitest';
import { GATES_PER_LEVEL, HEARTS, makeQuestion, move, newState, step, type GateState } from './gate.ts';

const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/** Works out the question's answer from its text, so the tests don't trust makeQuestion's own answer. */
function solve(q: string): number {
  let m: RegExpMatchArray | null;
  if ((m = q.match(/^(\d+) × (\d+)$/))) return +m[1] * +m[2];
  if ((m = q.match(/^(\d+) ÷ (\d+)$/))) return +m[1] / +m[2];
  if ((m = q.match(/^(\d+)\/(\d+) of (\d+)$/))) return (+m[1] * +m[3]) / +m[2];
  if ((m = q.match(/^(\d+) − (\d+)$/))) return +m[1] - +m[2];
  if ((m = q.match(/^(\d+)% of (\d+)$/))) return (+m[1] * +m[2]) / 100;
  if ((m = q.match(/^(\d+) \+ (\d+) × (\d+)$/))) return +m[1] + +m[2] * +m[3];
  throw new Error(`unknown question ${q}`);
}

/** Plays a run, steering into the right lane (or a wrong one when `wrong` says so) as each row nears. */
function play(seconds: number, seed: number, wrong: (n: number) => boolean): GateState {
  const s = newState();
  const rng = seeded(seed);
  let n = 0;
  for (let t = 0; t < seconds && !s.over; t += 1 / 60) {
    const row = s.rows.find((r) => !r.done);
    if (row && row.z > 0.8) {
      const right = row.opts.indexOf(row.a) - 1;
      const target = wrong(n) ? (right === 1 ? 0 : right + 1) : right;
      while (s.lane < target) move(s, 1);
      while (s.lane > target) move(s, -1);
    }
    const before = s.asked;
    step(s, 1 / 60, rng);
    if (s.asked > before) n++;
    s.events = [];
  }
  return s;
}

describe('Gate Runner', () => {
  it('asks real questions with three different whole-number gates and exactly one right answer', () => {
    const rng = seeded(7);
    for (let level = 1; level <= 8; level++) {
      for (let i = 0; i < 400; i++) {
        const { q, a, opts } = makeQuestion(level, rng);
        expect(solve(q)).toBe(a);
        expect(opts).toHaveLength(3);
        expect(new Set(opts).size).toBe(3);
        expect(opts.filter((o) => o === a)).toHaveLength(1);
        for (const o of opts) { expect(Number.isInteger(o)).toBe(true); expect(o).toBeGreaterThan(0); }
      }
    }
  });

  it('only adds harder topics at higher levels', () => {
    const rng = seeded(3);
    const early = Array.from({ length: 300 }, () => makeQuestion(1, rng).q);
    expect(early.every((q) => /×|÷/.test(q) && !q.includes('+'))).toBe(true);
    const late = Array.from({ length: 600 }, () => makeQuestion(6, rng).q);
    expect(late.some((q) => q.includes('%'))).toBe(true);
    expect(late.some((q) => q.includes('+'))).toBe(true);
  });

  it('a perfect runner clears gates, levels up and never loses a heart', () => {
    const s = play(90, 11, () => false);
    expect(s.over).toBe(false);
    expect(s.hearts).toBe(HEARTS);
    expect(s.cleared).toBeGreaterThanOrEqual(15);
    expect(s.level).toBe(1 + Math.floor(s.cleared / GATES_PER_LEVEL));
  });

  it('three wrong gates end the run, and orbs alone cannot keep it going', () => {
    const s = play(600, 5, () => true);
    expect(s.over).toBe(true);
    expect(s.hearts).toBe(0);
    expect(s.cleared).toBe(0);
    expect(s.asked).toBe(HEARTS);
  });

  it('cannot move past the outside lanes', () => {
    const s = newState();
    expect(move(s, -1)).toBe(true);
    expect(move(s, -1)).toBe(false);
    expect(s.lane).toBe(-1);
  });
});
