// Block Blast rules: fit shapes on an 8x8 board. Full rows and columns clear. The game ends when no shape fits.
export const SIZE = 8;
export const WIN_SCORE = 150;
export type Cell = number | null; // color index
export type Board = Cell[][];
export type Shape = [number, number][]; // [row, col] offsets from the top-left

export const SHAPES: Shape[] = [
  [[0, 0]],
  [[0, 0], [0, 1]], [[0, 0], [1, 0]],
  [[0, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]],
  [[0, 0], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 0]], [[0, 1], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [2, 1]], [[0, 1], [1, 1], [2, 1], [2, 0]], [[0, 0], [0, 1], [0, 2], [1, 0]], [[0, 0], [0, 1], [0, 2], [1, 2]],
  [[0, 0], [0, 1], [0, 2], [1, 1]], [[0, 1], [1, 0], [1, 1], [1, 2]],
];
export interface Piece { shape: Shape; color: number }
export interface Game { board: Board; tray: (Piece | null)[]; score: number; over: boolean }

export const emptyBoard = (): Board => Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(null));
export const sizeOf = (s: Shape) => ({ h: Math.max(...s.map(([r]) => r)) + 1, w: Math.max(...s.map(([, c]) => c)) + 1 });

export const canPlace = (b: Board, s: Shape, row: number, col: number) =>
  s.every(([r, c]) => row + r >= 0 && row + r < SIZE && col + c >= 0 && col + c < SIZE && b[row + r][col + c] === null);
export const fitsAnywhere = (b: Board, s: Shape) => {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (canPlace(b, s, r, c)) return true;
  return false;
};

function drawTray(b: Board, rng: () => number): Piece[] {
  // Make sure at least one of the three can be placed, so a fresh tray is never an instant loss.
  for (let tries = 0; tries < 20; tries++) {
    const tray = Array.from({ length: 3 }, () => ({ shape: SHAPES[Math.floor(rng() * SHAPES.length)], color: Math.floor(rng() * 5) }));
    if (tray.some((p) => fitsAnywhere(b, p.shape))) return tray;
  }
  return [{ shape: SHAPES[0], color: 0 }, { shape: SHAPES[0], color: 1 }, { shape: SHAPES[0], color: 2 }];
}

export function newGame(rng: () => number): Game {
  const board = emptyBoard();
  return { board, tray: drawTray(board, rng), score: 0, over: false };
}

/** Put tray piece `i` with its top-left at (row, col). Clears full rows and columns. */
export function place(g: Game, i: number, row: number, col: number, rng: () => number): Game {
  const p = g.tray[i];
  if (g.over || !p || !canPlace(g.board, p.shape, row, col)) return g;
  const board = g.board.map((r) => [...r]);
  for (const [r, c] of p.shape) board[row + r][col + c] = p.color;
  const rows = board.map((_, r) => r).filter((r) => board[r].every((v) => v !== null));
  const cols = Array.from({ length: SIZE }, (_, c) => c).filter((c) => board.every((r) => r[c] !== null));
  for (const r of rows) for (let c = 0; c < SIZE; c++) board[r][c] = null;
  for (const c of cols) for (let r = 0; r < SIZE; r++) board[r][c] = null;
  const lines = rows.length + cols.length;
  const score = g.score + p.shape.length + (lines ? 10 * lines * lines : 0);
  let tray: (Piece | null)[] = g.tray.map((t, k) => (k === i ? null : t));
  if (tray.every((t) => t === null)) tray = drawTray(board, rng);
  const over = !tray.some((t) => t && fitsAnywhere(board, t.shape));
  return { board, tray, score, over };
}
