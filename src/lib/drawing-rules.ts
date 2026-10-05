/** Squad Drawing helpers shared by the demo bots and the canvas. The real game runs on the server. */
export const DRAWING_WORDS = [
  'cat', 'dog', 'house', 'tree', 'sun', 'moon', 'star', 'car', 'boat', 'airplane', 'fish', 'flower', 'apple', 'banana', 'pizza', 'robot', 'rocket',
  'castle', 'dragon', 'bridge', 'bicycle', 'guitar', 'umbrella', 'snowman', 'rainbow', 'butterfly', 'spider', 'penguin', 'elephant', 'giraffe',
  'shark', 'turtle', 'cupcake', 'ice cream', 'hamburger', 'clock', 'key', 'crown', 'ladder', 'tent', 'volcano', 'pumpkin', 'ghost', 'kite',
  'balloon', 'backpack', 'book', 'pencil', 'glasses', 'hat', 'shoe', 'television', 'camera', 'computer', 'mountain', 'island', 'waterfall', 'owl', 'snail',
];

export interface DrawStroke { id: number; c: string; w: number; p: [number, number][] }

export const PEN_COLORS = ['#111111', '#e11d48', '#f97316', '#eab308', '#16a34a', '#2563eb', '#9333ea', '#ffffff'];
export const PEN_WIDTHS = [4, 12];
export const CANVAS = 1000;

/** The same rules as the server's guess check: spaces ignored, a trailing s allowed. */
export function isRightGuess(guess: string, word: string): boolean {
  const g = guess.toLowerCase().replace(/\s+/g, '');
  const w = word.toLowerCase().replace(/\s+/g, '');
  return g === w || g === `${w}s`;
}

/** The blanks guessers see. The first letter shows once half the time has passed. */
export function maskWord(word: string, showFirst: boolean): string {
  return [...word].map((ch, i) => (ch === ' ' ? ' ' : i === 0 && showFirst ? ch : '_')).join('');
}

/** Quick scribbles for practice buddies who "draw": a circle, a square, a zigzag, a few lines. */
export function scribble(seed: number): DrawStroke[] {
  const colors = PEN_COLORS.slice(0, 7);
  const rand = (n: number) => { seed = (seed * 9301 + 49297) % 233280; return (seed / 233280) * n; };
  const strokes: DrawStroke[] = [];
  const cx = 300 + rand(400);
  const cy = 300 + rand(400);
  const r = 120 + rand(120);
  strokes.push({ id: 1, c: colors[Math.floor(rand(colors.length))], w: 8, p: Array.from({ length: 33 }, (_, i) => [Math.round(cx + r * Math.cos((i / 32) * Math.PI * 2)), Math.round(cy + r * Math.sin((i / 32) * Math.PI * 2))] as [number, number]) });
  strokes.push({ id: 2, c: colors[Math.floor(rand(colors.length))], w: 8, p: [[cx - r, cy + r + 40], [cx + r, cy + r + 40], [cx + r, cy + r + 200], [cx - r, cy + r + 200], [cx - r, cy + r + 40]].map(([x, y]) => [Math.round(Math.min(990, x)), Math.round(Math.min(990, y))] as [number, number]) });
  strokes.push({ id: 3, c: colors[Math.floor(rand(colors.length))], w: 4, p: Array.from({ length: 9 }, (_, i) => [Math.round(80 + i * 100), Math.round(80 + (i % 2) * 90)] as [number, number]) });
  for (let k = 4; k < 8; k++) strokes.push({ id: k, c: colors[Math.floor(rand(colors.length))], w: 4, p: [[Math.round(rand(900)), Math.round(rand(900))], [Math.round(rand(900)), Math.round(rand(900))]] });
  return strokes;
}
