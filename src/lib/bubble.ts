// Bubble Pop rules: bubbles hang from the top. Tap a column to fire the bubble up it, match 3 or more
// touching bubbles of one color to pop them. Anything left hanging loose falls. Clear the board to win.
export const COLS = 7;
export const ROWS = 11;
export const COLORS = 4;
export const START_ROWS = 4;
export const DROP_AFTER = 5; // misses in a row before a new row comes down
export type Grid = (number | null)[][];
export interface Game { grid: Grid; shooter: number; next: number; misses: number; popped: number; over: 'win' | 'lose' | null }

const empty = (): Grid => Array.from({ length: ROWS }, () => Array<number | null>(COLS).fill(null));
const rndColor = (rng: () => number) => Math.floor(rng() * COLORS);

export function newGame(rng: () => number): Game {
  const grid = empty();
  for (let r = 0; r < START_ROWS; r++) for (let c = 0; c < COLS; c++) grid[r][c] = rndColor(rng);
  return { grid, shooter: rndColor(rng), next: rndColor(rng), misses: 0, popped: 0, over: null };
}

const nbrs = (r: number, c: number) => [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => a >= 0 && a < ROWS && b >= 0 && b < COLS);

/** Every cell reached from (r, c) through touching cells that pass `ok`. */
function flood(grid: Grid, r: number, c: number, ok: (v: number) => boolean): [number, number][] {
  const seen = new Set<number>([r * COLS + c]);
  const out: [number, number][] = [];
  const stack: [number, number][] = [[r, c]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    out.push([a, b]);
    for (const [x, y] of nbrs(a, b)) {
      const v = grid[x][y];
      if (v !== null && !seen.has(x * COLS + y) && ok(v)) { seen.add(x * COLS + y); stack.push([x, y]); }
    }
  }
  return out;
}

/** Remove bubbles that are no longer joined to the top row. Returns how many fell. */
function dropLoose(grid: Grid): number {
  const held = new Set<number>();
  for (let c = 0; c < COLS; c++) if (grid[0][c] !== null && !held.has(c)) for (const [a, b] of flood(grid, 0, c, () => true)) held.add(a * COLS + b);
  let n = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] !== null && !held.has(r * COLS + c)) { grid[r][c] = null; n++; }
  return n;
}

/** The row a bubble fired up a column lands in: just under the lowest bubble there. */
export const landingRow = (grid: Grid, col: number) => {
  let low = -1;
  for (let r = 0; r < ROWS; r++) if (grid[r][col] !== null) low = r;
  return low + 1;
};

export function shoot(g: Game, col: number, rng: () => number): Game {
  if (g.over || col < 0 || col >= COLS) return g;
  const grid = g.grid.map((row) => [...row]);
  const r = landingRow(grid, col);
  if (r >= ROWS) return { ...g, over: 'lose' };
  grid[r][col] = g.shooter;
  const group = flood(grid, r, col, (v) => v === g.shooter);
  let popped = g.popped, misses = g.misses + 1;
  if (group.length >= 3) {
    for (const [a, b] of group) grid[a][b] = null;
    popped += group.length + dropLoose(grid);
    misses = 0;
  }
  if (misses >= DROP_AFTER) {
    if (grid[ROWS - 2].some((v) => v !== null)) return { ...g, grid, popped, over: 'lose' };
    grid.pop();
    grid.unshift(Array.from({ length: COLS }, () => rndColor(rng)));
    misses = 0;
  }
  if (grid[ROWS - 1].some((v) => v !== null)) return { ...g, grid, popped, over: 'lose' };
  const won = grid.every((row) => row.every((v) => v === null));
  // Only offer colors still on the board so the last bubbles can always be cleared.
  const onBoard = [...new Set(grid.flat().filter((v): v is number => v !== null))];
  const pick = () => (onBoard.length ? onBoard[Math.floor(rng() * onBoard.length)] : rndColor(rng));
  return { grid, shooter: g.next, next: pick(), misses, popped, over: won ? 'win' : null };
}
