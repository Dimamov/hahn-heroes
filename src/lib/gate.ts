// Gate Runner: Ana runs toward the Nexus portal. Each row of three gates carries an answer to the
// math question at the top; move into the lane with the right answer before the gates reach you.
// Everything is in "stage units" on a 400 x 720 portrait stage. Depth z runs from 0 (the portal)
// to 1 (Ana's feet).
export const W = 400;
export const H = 720;
export const HORIZON = 230;
export const PLAYER_Y = 640;
export const CX = W / 2;
export const HEARTS = 3;
/** Clear this many gates in one run to win the daily reward. */
export const GATE_WIN = 10;
/** Every this many cleared gates, the level goes up and the run speeds up. */
export const GATES_PER_LEVEL = 5;
const START_SPEED = 0.3;
const MAX_SPEED = 0.62;
export const INTRO_SECONDS = 1.4;

export type Lane = -1 | 0 | 1;
export interface Question { q: string; a: number; opts: number[] }
export interface Row extends Question { z: number; done: boolean; picked: number | null }
export interface Orb { z: number; lane: Lane; taken: boolean }
export type GateEvent = { kind: 'right' | 'wrong'; row: Row } | { kind: 'orb' } | { kind: 'level'; level: number } | { kind: 'over' };
export interface GateState {
  time: number; intro: number; speed: number; lane: Lane;
  rows: Row[]; orbs: Orb[]; nextRow: number; nextOrb: number;
  score: number; hearts: number; combo: number; bestCombo: number; level: number; cleared: number; asked: number;
  over: boolean; events: GateEvent[];
}

export const newState = (): GateState => ({
  time: 0, intro: INTRO_SECONDS, speed: START_SPEED, lane: 0, rows: [], orbs: [], nextRow: 0.3, nextOrb: 0.6,
  score: 0, hearts: HEARTS, combo: 0, bestCombo: 0, level: 1, cleared: 0, asked: 0, over: false, events: [],
});

/** Perspective: how far down the screen, how big and how wide the road is at depth z. */
export function proj(z: number) {
  const p = Math.pow(Math.max(0, z), 1.7);
  return { p, y: HORIZON + (PLAYER_Y - HORIZON) * p, s: 0.1 + 0.9 * p, half: 24 + 176 * p };
}
export const laneX = (lane: number, z: number) => CX + lane * proj(z).half * 0.66;

export function move(s: GateState, dir: -1 | 1): boolean {
  if (s.over) return false;
  const next = Math.max(-1, Math.min(1, s.lane + dir)) as Lane;
  if (next === s.lane) return false;
  s.lane = next;
  return true;
}

const between = (rng: () => number, a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
const pick = <T,>(rng: () => number, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
function shuffle<T>(rng: () => number, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; }
  return xs;
}

/**
 * A 5th/6th grade question with three different whole-number answers, one of them right.
 * Wrong answers are near misses (off by one step), so guessing by size doesn't work.
 * Levels 1-2: times tables and division. 3-4: adds fractions of a number and two-digit subtraction.
 * 5 and up: adds percents and order of operations.
 */
export function makeQuestion(level: number, rng: () => number = Math.random): Question {
  const kinds = level < 3 ? [0, 1] : level < 5 ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5];
  const k = pick(rng, kinds);
  let q: string, a: number, near: number[];
  if (k === 0) { const x = between(rng, 3, 12), y = between(rng, 4, 12); q = `${x} × ${y}`; a = x * y; near = [x * (y + 1), x * (y - 1), (x + 1) * y, a + 10, a - 10]; }
  else if (k === 1) { const y = between(rng, 3, 12), z = between(rng, 3, 12); q = `${y * z} ÷ ${y}`; a = z; near = [z + 1, z - 1, z + 2, z - 2]; }
  else if (k === 2) { const d = pick(rng, [2, 3, 4, 5, 10]), n = between(rng, 1, d - 1), m = between(rng, 2, 9) * d; q = `${n}/${d} of ${m}`; a = (n * m) / d; near = [m / d, a + m / d, a - m / d, a + 2, m - a]; }
  else if (k === 3) { const x = between(rng, 4, 9) * 10 + between(rng, 1, 9), y = between(rng, 2, 3) * 10 + between(rng, 1, 9); q = `${x} − ${y}`; a = x - y; near = [a + 10, a - 10, a + 1, a - 1, a + 2]; }
  else if (k === 4) { const p = pick(rng, [10, 20, 25, 50, 75]), m = between(rng, 2, 12) * (p === 25 || p === 75 ? 4 : p === 20 ? 5 : 10); q = `${p}% of ${m}`; a = (p * m) / 100; near = [a + m / 10, a - m / 10, m - a, a * 2, a + 5]; }
  else { const x = between(rng, 2, 9), y = between(rng, 2, 6), z = between(rng, 2, 6); q = `${x} + ${y} × ${z}`; a = x + y * z; near = [(x + y) * z, a + 1, a - 1, a + y]; }
  const set = new Set([a]);
  for (const n of shuffle(rng, near)) if (set.size < 3 && n > 0 && Number.isInteger(n)) set.add(n);
  for (let d = 1; set.size < 3; d++) { if (a + d > 0) set.add(a + d); if (set.size < 3 && a - d > 0) set.add(a - d); }
  return { q, a, opts: shuffle(rng, [...set]) };
}

/** Advances the run by dt seconds. Sights, sounds and rewards read s.events, then clear it. */
export function step(s: GateState, dt: number, rng: () => number = Math.random) {
  if (s.over) return;
  s.time += dt;
  if (s.intro > 0) { s.intro = Math.max(0, s.intro - dt); return; }
  const dz = s.speed * dt;
  for (const r of s.rows) {
    r.z += dz;
    if (!r.done && r.z >= 0.97) resolve(s, r);
    if (s.over) return;
  }
  for (const o of s.orbs) {
    o.z += dz;
    if (!o.taken && o.z >= 0.95 && o.z < 1.04 && o.lane === s.lane) { o.taken = true; s.score += 10; s.events.push({ kind: 'orb' }); }
  }
  s.rows = s.rows.filter((r) => r.z <= 1.3);
  s.orbs = s.orbs.filter((o) => o.z < 1.25 && !o.taken);
  if (!s.rows.some((r) => !r.done)) {
    s.nextRow -= dt;
    if (s.nextRow <= 0) { s.rows.push({ ...makeQuestion(s.level, rng), z: 0, done: false, picked: null }); s.asked++; }
  }
  s.nextOrb -= dt;
  if (s.nextOrb <= 0) {
    s.nextOrb = 0.42;
    // keep orbs out of the way of a row of gates that has just appeared
    if (!s.rows.some((r) => r.z < 0.18)) s.orbs.push({ z: 0, lane: (between(rng, 0, 2) - 1) as Lane, taken: false });
  }
}

function resolve(s: GateState, r: Row) {
  r.done = true;
  r.picked = s.lane + 1;
  s.nextRow = 0.75;
  if (r.opts[r.picked] === r.a) {
    s.combo++;
    s.bestCombo = Math.max(s.bestCombo, s.combo);
    s.cleared++;
    s.score += 100 * multiplier(s.combo);
    s.events.push({ kind: 'right', row: r });
    if (s.cleared % GATES_PER_LEVEL === 0) {
      s.level++;
      s.speed = Math.min(MAX_SPEED, s.speed + 0.045);
      s.events.push({ kind: 'level', level: s.level });
    }
  } else {
    s.combo = 0;
    s.hearts--;
    s.events.push({ kind: 'wrong', row: r });
    if (s.hearts <= 0) { s.over = true; s.events.push({ kind: 'over' }); }
  }
}

/** A streak of right gates multiplies the points: x2 from 3 in a row, x3 from 6, and so on. */
export const multiplier = (combo: number) => 1 + Math.floor(combo / 3);
