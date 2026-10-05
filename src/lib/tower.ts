// Hero Defense rules: shadows walk a path, heroes you place on the grass stop them. Survive every wave to win.
export const COLS = 6;
export const ROWS = 8;
export const LIVES = 10;
export const WAVES = 8;
export const START_ENERGY = 60;

const row = (r: number, from: number, to: number): [number, number][] => {
  const out: [number, number][] = [];
  const step = from <= to ? 1 : -1;
  for (let c = from; c !== to + step; c += step) out.push([r, c]);
  return out;
};
/** The shadows' road, one [row, col] per cell, snaking down the board. */
export const PATH: [number, number][] = [...row(1, 0, 5), [2, 5], ...row(3, 5, 0), [4, 0], ...row(5, 0, 5)];
const onPath = new Set(PATH.map(([r, c]) => r * COLS + c));
export const isGrass = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS && !onPath.has(r * COLS + c);

export const KINDS = {
  spark: { name: 'Spark', icon: '⚡', cost: 20, range: 1.6, damage: 1, every: 0.5, slow: 0 },
  frost: { name: 'Frost', icon: '❄️', cost: 30, range: 1.5, damage: 0.4, every: 0.6, slow: 0.5 },
  boom: { name: 'Boom', icon: '💥', cost: 45, range: 2.2, damage: 4, every: 1.6, slow: 0 },
} as const;
export type Kind = keyof typeof KINDS;

export interface Hero { r: number; c: number; kind: Kind; wait: number }
export interface Foe { p: number; hp: number; max: number; slow: number }
export interface State {
  heroes: Hero[]; foes: Foe[]; energy: number; lives: number; wave: number; toSpawn: number; spawnIn: number;
  phase: 'build' | 'wave' | 'won' | 'lost';
}

export const newState = (): State => ({ heroes: [], foes: [], energy: START_ENERGY, lives: LIVES, wave: 0, toSpawn: 0, spawnIn: 0, phase: 'build' });

export const waveSize = (wave: number) => 4 + wave * 2;
export const foeHp = (wave: number) => 3 + wave * 2;

export function placeHero(s: State, r: number, c: number, kind: Kind): State {
  if (s.phase === 'won' || s.phase === 'lost' || !isGrass(r, c) || s.heroes.some((h) => h.r === r && h.c === c) || s.energy < KINDS[kind].cost) return s;
  return { ...s, energy: s.energy - KINDS[kind].cost, heroes: [...s.heroes, { r, c, kind, wait: 0 }] };
}

export function startWave(s: State): State {
  if (s.phase !== 'build') return s;
  return { ...s, wave: s.wave + 1, toSpawn: waveSize(s.wave + 1), spawnIn: 0, phase: 'wave' };
}

/** Where a foe is on the board, in cell units (row, col). */
export function foePos(p: number): [number, number] {
  const i = Math.min(Math.floor(p), PATH.length - 1);
  const a = PATH[i], b = PATH[Math.min(i + 1, PATH.length - 1)];
  const t = Math.min(p - i, 1);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

const SPEED = 0.8; // cells a second

/** Move the game on by `dt` seconds. */
export function step(s: State, dt: number): State {
  if (s.phase !== 'wave') return s;
  let { toSpawn, spawnIn, energy, lives } = s;
  let foes = s.foes.map((f) => ({ ...f, slow: Math.max(0, f.slow - dt) }));
  spawnIn -= dt;
  if (toSpawn > 0 && spawnIn <= 0) { foes.push({ p: 0, hp: foeHp(s.wave), max: foeHp(s.wave), slow: 0 }); toSpawn--; spawnIn = 0.9; }
  foes = foes.map((f) => ({ ...f, p: f.p + SPEED * (f.slow > 0 ? 0.5 : 1) * dt }));
  const heroes = s.heroes.map((h) => {
    const k = KINDS[h.kind];
    const wait = h.wait - dt;
    if (wait > 0) return { ...h, wait };
    let best = -1, bestP = -1;
    foes.forEach((f, i) => { const [fr, fc] = foePos(f.p); if (f.hp > 0 && Math.hypot(fr - h.r, fc - h.c) <= k.range && f.p > bestP) { best = i; bestP = f.p; } });
    if (best < 0) return { ...h, wait: 0 };
    foes[best] = { ...foes[best], hp: foes[best].hp - k.damage, slow: k.slow ? 1.2 : foes[best].slow };
    return { ...h, wait: k.every };
  });
  const alive: Foe[] = [];
  for (const f of foes) {
    if (f.hp <= 0) energy += 4;
    else if (f.p >= PATH.length - 1) lives--;
    else alive.push(f);
  }
  let phase: State['phase'] = s.phase;
  if (lives <= 0) phase = 'lost';
  else if (toSpawn === 0 && alive.length === 0) { phase = s.wave >= WAVES ? 'won' : 'build'; if (phase === 'build') energy += 15; }
  return { ...s, heroes, foes: alive, energy, lives: Math.max(0, lives), toSpawn, spawnIn, phase };
}
