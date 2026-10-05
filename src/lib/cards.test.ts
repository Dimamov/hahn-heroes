import { describe, expect, it } from 'vitest';
import { CARDS, fairness } from './cards.ts';

const none = () => false;
describe('card trade fairness', () => {
  it('has unique card ids and every rarity', () => {
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    expect(new Set(CARDS.map((c) => c.rarity)).size).toBe(5);
  });
  it('treats equal swaps as fine and warns on uneven ones', () => {
    expect(fairness([{ card: 'c-lamp', qty: 2 }], [{ card: 'c-map', qty: 2 }], none, none).level).toBe('ok');
    const uneven = fairness([{ card: 'u-owl', qty: 1 }], [{ card: 'c-map', qty: 1 }], none, none);
    expect(uneven).toEqual({ level: 'uneven', givingMore: 'a' });
  });
  it('blocks one-sided and extremely lopsided trades', () => {
    expect(fairness([{ card: 'r-luna', qty: 1 }], [], none, none).level).toBe('blocked');
    expect(fairness([{ card: 'r-luna', qty: 1 }], [{ card: 'c-map', qty: 1 }], none, none).level).toBe('blocked');
    expect(fairness([], [], none, none).level).toBe('empty');
  });
  it('values a duplicate at half', () => {
    // B already owns the common, so A's two commons are worth 1 to B; B's uncommon is worth 3 to A.
    expect(fairness([{ card: 'c-map', qty: 2 }], [{ card: 'u-owl', qty: 1 }], none, (c) => c === 'c-map').level).toBe('uneven');
  });
});
