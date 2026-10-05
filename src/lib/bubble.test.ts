import { describe, expect, it } from 'vitest';
import { COLS, ROWS, landingRow, newGame, shoot, type Game, type Grid } from './bubble.ts';

const blank = (): Grid => Array.from({ length: ROWS }, () => Array<number | null>(COLS).fill(null));
const game = (grid: Grid, shooter = 0): Game => ({ grid, shooter, next: 0, misses: 0, popped: 0, over: null });
const rng = () => 0.1;

describe('bubble pop rules', () => {
  it('starts with four rows hanging from the top', () => {
    const g = newGame(Math.random);
    expect(g.grid.slice(0, 4).every((r) => r.every((v) => v !== null))).toBe(true);
    expect(g.grid[4].every((v) => v === null)).toBe(true);
  });
  it('lands under the lowest bubble in the column', () => {
    const grid = blank(); grid[0][2] = 1; grid[1][2] = 1;
    expect(landingRow(grid, 2)).toBe(2);
    expect(landingRow(grid, 3)).toBe(0);
  });
  it('pops three or more touching bubbles of the same color', () => {
    const grid = blank(); grid[0][0] = 0; grid[0][1] = 0; grid[0][2] = 1; grid[1][2] = 1; // two 0s on top, shoot a 0 under column 0
    grid[1][0] = null;
    const g = shoot(game(grid, 0), 0, rng);
    expect(g.grid[0][0]).toBeNull();
    expect(g.grid[0][1]).toBeNull();
    expect(g.popped).toBeGreaterThanOrEqual(2);
  });
  it('drops bubbles left hanging loose', () => {
    const grid = blank(); grid[0][0] = 1; grid[1][0] = 0; grid[2][0] = 0; grid[2][1] = 3; // the 3 hangs only from the 0s
    const g = shoot(game(grid, 0), 0, rng);
    expect(g.grid[1][0]).toBeNull();
    expect(g.grid[2][1]).toBeNull();
    expect(g.grid[0][0]).toBe(1);
    expect(g.popped).toBe(4);
  });
  it('clearing the board wins', () => {
    let g = game(blank(), 0);
    g.grid[0][0] = 0; g.grid[0][1] = 0;
    const done = shoot(g, 2, rng);
    expect(done.over).toBe('win');
  });
  it('loses when bubbles reach the bottom', () => {
    const grid = blank(); for (let r = 0; r < ROWS - 1; r++) grid[r][3] = r % 2;
    const g = shoot(game(grid, 2), 3, rng);
    expect(g.over).toBe('lose');
  });
});
