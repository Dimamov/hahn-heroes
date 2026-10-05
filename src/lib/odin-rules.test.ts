import { describe, expect, it } from 'vitest';
import { deal, handColumns, move, newDeck, playable, type OdinGame } from './odin-rules.ts';

const game = (over: Partial<OdinGame>): OdinGame => ({
  deck: ['G9', 'G8', 'G7', 'G6', 'G5', 'G4', 'G3'], discard: ['R5'], color: 'R', order: ['a', 'b', 'c'],
  hands: { a: ['R7', 'W4'], b: ['Y1'], c: ['Y2'] }, turn: 0, dir: 1, turnStart: 0, winner: null, ...over,
});

describe('odin rules', () => {
  it('has a standard 108 card deck with one zero per colour', () => {
    const d = newDeck();
    expect(d).toHaveLength(108);
    expect(d.filter((c) => c === 'R0')).toHaveLength(1);
    expect(d.filter((c) => c === 'W4')).toHaveLength(4);
  });
  it('matches by colour, number or wild', () => {
    expect(playable('R9', 'R5', 'R')).toBe(true);
    expect(playable('B5', 'R5', 'R')).toBe(true);
    expect(playable('B6', 'R5', 'R')).toBe(false);
    expect(playable('W', 'R5', 'R')).toBe(true);
    expect(playable('B4', 'W', 'B')).toBe(true);
    expect(playable('B4', 'W', 'G')).toBe(false);
  });
  it('deals seven cards each and starts on a plain number', () => {
    const g = deal(['a', 'b', 'c', 'd']);
    expect(Object.values(g.hands).every((h) => h.length === 7)).toBe(true);
    expect(g.discard[0]).toMatch(/^[RBGY][0-9]$/);
    expect(g.deck).toHaveLength(108 - 28 - 1);
  });
  it('applies skip, reverse, draw two and wild draw four', () => {
    const skip = game({ hands: { a: ['RS', 'R1'], b: ['Y1'], c: ['Y2'] } });
    move(skip, 'a', 'RS', null, 1);
    expect(skip.order[skip.turn]).toBe('c');
    const rev = game({ hands: { a: ['RR', 'R1'], b: ['Y1'], c: ['Y2'] } });
    move(rev, 'a', 'RR', null, 1);
    expect(rev.order[rev.turn]).toBe('c');
    expect(rev.dir).toBe(-1);
    const two = game({ hands: { a: ['RD', 'R1'], b: ['Y1'], c: ['Y2'] } });
    move(two, 'a', 'RD', null, 1);
    expect(two.hands.b).toHaveLength(3);
    expect(two.order[two.turn]).toBe('c');
    const four = game({});
    move(four, 'a', 'W4', 'B', 1);
    expect(four.color).toBe('B');
    expect(four.hands.b).toHaveLength(5);
  });
  it('treats reverse as a skip with two players and ends when a hand is empty', () => {
    const g = game({ order: ['a', 'b'], hands: { a: ['RR', 'R1'], b: ['Y1'] } });
    move(g, 'a', 'RR', null, 1);
    expect(g.order[g.turn]).toBe('a');
    const w = game({ hands: { a: ['R7'], b: ['Y1'], c: ['Y2'] } });
    move(w, 'a', 'R7', null, 1);
    expect(w.winner).toBe('a');
  });
  it('reshuffles the pile when the deck runs out and rejects illegal moves', () => {
    const g = game({ deck: [], discard: ['R1', 'R2', 'R3', 'R5'], hands: { a: ['B7', 'R9'], b: ['Y1'], c: ['Y2'] } });
    move(g, 'a', null, null, 1);
    expect(g.hands.a).toHaveLength(3);
    expect(g.discard).toEqual(['R5']);
    const h = game({});
    expect(() => move(h, 'b', 'Y1', null, 1)).toThrow('not your turn');
    expect(() => move(h, 'a', 'B1', null, 1)).toThrow('do not have');
    expect(() => move(h, 'a', 'W4', null, 1)).toThrow('pick a colour');
  });
  it('keeps every card on screen by widening the grid as hands grow', () => {
    expect(handColumns(7)).toBe(4);
    expect(handColumns(30)).toBe(7);
    expect(handColumns(60)).toBe(8);
  });
});
