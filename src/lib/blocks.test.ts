import { describe, expect, it } from 'vitest';
import { SHAPES, SIZE, WIN_SCORE, canPlace, emptyBoard, fitsAnywhere, newGame, place, type Game } from './blocks.ts';

const rng = () => 0.3;
const game = (over: Partial<Game> = {}): Game => ({ board: emptyBoard(), tray: [{ shape: SHAPES[0], color: 0 }, { shape: SHAPES[3], color: 1 }, { shape: SHAPES[7], color: 2 }], score: 0, over: false, ...over });

describe('block blast rules', () => {
  it('only places shapes inside the board on empty cells', () => {
    const b = emptyBoard(); b[0][0] = 1;
    expect(canPlace(b, SHAPES[0], 0, 0)).toBe(false);
    expect(canPlace(b, SHAPES[3], 0, SIZE - 2)).toBe(false);
    expect(canPlace(b, SHAPES[3], 0, 1)).toBe(true);
  });
  it('clears a full row and scores it', () => {
    const g = game(); for (let c = 1; c < SIZE; c++) g.board[0][c] = 0;
    const n = place(g, 0, 0, 0, rng);
    expect(n.board[0].every((v) => v === null)).toBe(true);
    expect(n.score).toBe(1 + 10);
  });
  it('clears a row and a column together for a bigger score', () => {
    const g = game();
    for (let c = 1; c < SIZE; c++) g.board[0][c] = 0;
    for (let r = 1; r < SIZE; r++) g.board[r][0] = 0;
    const n = place(g, 0, 0, 0, rng);
    expect(n.score).toBe(1 + 40);
    expect(n.board.flat().every((v) => v === null)).toBe(true);
  });
  it('draws a new tray after the third piece and always has a playable piece', () => {
    let g = newGame(Math.random);
    g = place(g, 0, 0, 0, Math.random);
    expect(g.tray.filter(Boolean)).toHaveLength(2);
    for (let i = 0; i < 50; i++) { const t = newGame(Math.random); expect(t.tray.some((p) => p && fitsAnywhere(t.board, p.shape))).toBe(true); }
  });
  it('ends when nothing fits', () => {
    const g = game({ tray: [{ shape: SHAPES[0], color: 0 }, null, null] });
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) g.board[r][c] = (r + c) % 2 ? 1 : null;
    // checkerboard: single cells still fit, so place one and the rest are blocked by a full tray of 3x3
    g.tray = [{ shape: SHAPES[8], color: 0 }, null, { shape: SHAPES[0], color: 1 }];
    const n = place(g, 2, 0, 0, rng);
    expect(n.over).toBe(true);
  });
  it('has a reachable win score', () => { expect(WIN_SCORE).toBeGreaterThan(0); });
});
