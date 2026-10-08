// Nexus Dash: a side-scrolling runner. The hero runs by itself; jump over shadow traps, slide under
// energy barriers, grab coins and power-ups. All distances are in "world units" on a 160 x 80 stage.
export const W = 160;
export const H = 80;
export const GROUND = 64;
export const HERO_X = 24;
export const HERO_W = 6;
export const STAND_H = 12;
export const SLIDE_H = 6;
export const SLIDE_SECONDS = 0.55;
const GRAVITY = 260;
const JUMP_V = 105;
export const SURGE_SECONDS = 4;
export const DASH_WIN = 250;

export type ObstacleKind = 'trap' | 'bar';
export type PickupKind = 'coin' | 'shield' | 'surge';
export interface Obstacle { kind: ObstacleKind; x: number; w: number; top: number; h: number }
export interface Pickup { kind: PickupKind; x: number; bottom: number }
export interface DashState {
  time: number; distance: number; speed: number;
  bottom: number; vy: number; slide: number;
  obstacles: Obstacle[]; pickups: Pickup[];
  sinceSpawn: number; gap: number; sincePower: number;
  shield: boolean; surge: number; coins: number; flash: number; over: boolean;
}

export const newState = (): DashState => ({
  time: 0, distance: 0, speed: 70, bottom: GROUND, vy: 0, slide: 0, obstacles: [], pickups: [],
  sinceSpawn: 0, gap: 120, sincePower: 0, shield: false, surge: 0, coins: 0, flash: 0, over: false,
});

export const onGround = (s: DashState) => s.bottom >= GROUND && s.vy >= 0;
export const heroHeight = (s: DashState) => (s.slide > 0 ? SLIDE_H : STAND_H);
export const score = (s: DashState) => Math.floor(s.distance / 10) + s.coins * 3;

export function jump(s: DashState) { if (!s.over && onGround(s) && s.slide <= 0) { s.vy = -JUMP_V; s.bottom -= 0.01; } }
export function slide(s: DashState) { if (!s.over && onGround(s) && s.slide <= 0) s.slide = SLIDE_SECONDS; }

const hits = (ax: number, aw: number, atop: number, ah: number, bx: number, bw: number, btop: number, bh: number) =>
  ax < bx + bw && ax + aw > bx && atop < btop + bh && atop + ah > btop;

/** Adds the next trap or barrier (and coins above traps), and now and then a power-up. */
function spawn(s: DashState, rng: () => number) {
  const bar = s.time > 6 && rng() < 0.35;
  const x = W + 10;
  if (bar) s.obstacles.push({ kind: 'bar', x, w: 10, top: 0, h: GROUND - 8 }); // hangs from the top of the stage down to 8 above the ground: it cannot be jumped, only slid under
  else {
    s.obstacles.push({ kind: 'trap', x, w: 7, top: GROUND - 9, h: 9 });
    for (let i = 0; i < 3; i++) s.pickups.push({ kind: 'coin', x: x - 4 + i * 6, bottom: GROUND - 17 });
  }
  if (rng() < 0.4) for (let i = 0; i < 3; i++) s.pickups.push({ kind: 'coin', x: x + 40 + i * 6, bottom: GROUND - 2 });
  if (s.sincePower > 900 && rng() < 0.5) {
    s.pickups.push({ kind: rng() < 0.5 ? 'shield' : 'surge', x: x + 55, bottom: GROUND - 1 });
    s.sincePower = 0;
  }
  s.gap = 80 + s.speed * 0.4 + rng() * 40;
  s.sinceSpawn = 0;
}

/** Moves the world forward by dt seconds. */
export function step(s: DashState, dt: number, rng: () => number = Math.random) {
  if (s.over) return;
  s.time += dt;
  s.speed = Math.min(130, 70 + s.time * 2.2) * (s.surge > 0 ? 1.35 : 1);
  const move = s.speed * dt;
  s.distance += move * (s.surge > 0 ? 2 : 1);
  s.sinceSpawn += move;
  s.sincePower += move;
  s.flash = Math.max(0, s.flash - dt);
  s.surge = Math.max(0, s.surge - dt);
  if (s.slide > 0) s.slide = Math.max(0, s.slide - dt);

  s.vy += GRAVITY * dt;
  s.bottom += s.vy * dt;
  if (s.bottom >= GROUND) { s.bottom = GROUND; s.vy = 0; }

  if (s.sinceSpawn >= s.gap) spawn(s, rng);
  for (const o of s.obstacles) o.x -= move;
  for (const p of s.pickups) p.x -= move;
  s.obstacles = s.obstacles.filter((o) => o.x + o.w > -10);

  const hh = heroHeight(s);
  const hx = HERO_X + 1, hw = HERO_W - 2, htop = s.bottom - hh;
  const keep: Pickup[] = [];
  for (const p of s.pickups) {
    if (hits(hx, hw, htop, hh, p.x, 5, p.bottom - 5, 5)) {
      if (p.kind === 'coin') s.coins += 1;
      else if (p.kind === 'shield') s.shield = true;
      else s.surge = SURGE_SECONDS;
    } else if (p.x > -10) keep.push(p);
  }
  s.pickups = keep;

  const alive: Obstacle[] = [];
  for (const o of s.obstacles) {
    if (hits(hx, hw, htop, hh, o.x, o.w, o.top, o.h)) {
      if (s.surge > 0) continue; // surge smashes through
      if (s.shield) { s.shield = false; s.flash = 0.5; continue; }
      s.over = true;
    }
    alive.push(o);
  }
  s.obstacles = alive;
}

// What a runner or a trail needs to unlock, by best score.
export const RUNNERS = [
  { id: 'runner', icon: '🏃', name: 'Runner', need: 0 },
  { id: 'fox', icon: '🦊', name: 'Fox', need: 100 },
  { id: 'ninja', icon: '🥷', name: 'Ninja', need: 250 },
  { id: 'robot', icon: '🤖', name: 'Robot', need: 400 },
] as const;
export const TRAILS = [
  { id: 'spark', icon: '✨', name: 'Sparks', need: 0 },
  { id: 'rainbow', icon: '🌈', name: 'Rainbow', need: 150 },
  { id: 'lightning', icon: '⚡', name: 'Lightning', need: 300 },
  { id: 'flame', icon: '🔥', name: 'Flame', need: 500 },
] as const;
export type RunnerId = (typeof RUNNERS)[number]['id'];
export type TrailId = (typeof TRAILS)[number]['id'];
export const unlocked = (need: number, best: number) => best >= need;
