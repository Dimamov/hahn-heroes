import { describe, expect, it } from 'vitest';
import { moveHide, newHideGame, searchHide, seekerOf, tickHide } from './hide.ts';

const players = [{ id: 'a', bot: false }, { id: 'b', bot: true }, { id: 'c', bot: true }];
const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('hide and seek', () => {
  it('deals 24 different props and a seeker', () => {
    const g = newHideGame(players, 0);
    expect(new Set(g.layout).size).toBe(24);
    expect(g.order).toHaveLength(3);
  });
  it('lets hiders sneak once, and the seeker finds them', () => {
    const g = newHideGame(players, 0, seq([0.1, 0.5, 0.9]));
    const seeker = seekerOf(g);
    const [h1, h2] = g.order.filter((x) => x !== seeker);
    expect(() => moveHide(g, seeker, 3)).toThrow('seeker');
    moveHide(g, h1, 7); moveHide(g, h2, 9);
    tickHide(g, 1000);
    expect(g.phase).toBe('seek');
    expect(() => moveHide(g, h1, 7)).toThrow('different');
    moveHide(g, h1, 8);
    expect(() => moveHide(g, h1, 10)).toThrow('already sneaked');
    expect(() => searchHide(g, h1, 9)).toThrow('not your search');
    expect(searchHide(g, seeker, 7)).toBe(0);
    expect(() => searchHide(g, seeker, 7)).toThrow('already checked');
    expect(searchHide(g, seeker, 9)).toBe(1);
    expect(searchHide(g, seeker, 8)).toBe(1);
    tickHide(g, 2000);
    expect(g.phase).toBe('reveal');
    expect(g.scores[seeker]).toBe(6);
  });
  it('plays every round with a different seeker, scores survivors, and ends', () => {
    const g = newHideGame(players, 0, seq([0.3]));
    const seekers = new Set<string>();
    for (let t = 0; t < 400 && g.phase !== 'done'; t++) { tickHide(g, t * 1000); seekers.add(seekerOf(g)); }
    expect(g.phase).toBe('done');
    expect(seekers.size).toBe(3);
    expect(Object.values(g.scores).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
});
