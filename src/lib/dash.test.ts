import { describe, expect, it } from 'vitest';
import { DASH_WIN, GROUND, RUNNERS, TRAILS, heroHeight, jump, newState, onGround, score, slide, step, unlocked, type DashState } from './dash.ts';

const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/** A simple player: jump when a trap is close, slide when a barrier is close. */
function play(seconds: number, seed: number, bot: boolean): DashState {
  const s = newState();
  const rng = seeded(seed);
  const dt = 1 / 60;
  for (let t = 0; t < seconds && !s.over; t += dt) {
    if (bot) {
      const next = s.obstacles.find((o) => o.x + o.w > 24);
      if (next) {
        const lead = s.speed * 0.28;
        if (next.kind === 'trap' && next.x - 30 < lead && next.x > 24) jump(s);
        if (next.kind === 'bar' && next.x - 30 < lead * 0.8 && next.x > 24) slide(s);
      }
    }
    step(s, dt, rng);
  }
  return s;
}

describe('Nexus Dash', () => {
  it('a barrier cannot be jumped over, only slid under', () => {
    const rng = seeded(5);
    for (let tries = 0; tries < 2; tries++) {
      const s = newState();
      s.time = 10; // barriers only appear after a few seconds
      s.obstacles = [{ kind: 'bar', x: 60, w: 10, top: 0, h: GROUND - 8 }];
      s.sinceSpawn = -9999;
      for (let t = 0; t < 3 && !s.over; t += 1 / 60) {
        const o = s.obstacles[0];
        if (o && o.x - 24 < 14 && o.x > 20) { if (tries === 0) jump(s); else slide(s); }
        step(s, 1 / 60, rng);
      }
      expect(s.over, tries === 0 ? 'jumping hits it' : 'sliding passes').toBe(tries === 0);
    }
  });

  it('a hero who never moves hits the first trap', () => {
    const s = play(30, 3, false);
    expect(s.over).toBe(true);
  });

  it('a well-timed player survives a long run, on many layouts', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = play(60, seed, true);
      expect(s.over, `seed ${seed} died at ${s.time.toFixed(1)}s`).toBe(false);
      expect(score(s)).toBeGreaterThan(DASH_WIN);
    }
  });

  it('jumping and sliding only work on the ground, and a slide makes the hero shorter', () => {
    const s = newState();
    jump(s);
    expect(onGround(s)).toBe(false);
    const vy = s.vy;
    jump(s);
    expect(s.vy).toBe(vy);
    slide(s);
    expect(s.slide).toBe(0);
    const t = newState();
    slide(t);
    expect(heroHeight(t)).toBeLessThan(heroHeight(newState()));
    jump(t);
    expect(t.vy).toBe(0);
  });

  it('a shield absorbs one hit and a surge smashes through', () => {
    const a = newState();
    a.shield = true;
    a.obstacles.push({ kind: 'trap', x: 24, w: 7, top: GROUND - 9, h: 9 });
    step(a, 0.016, seeded(1));
    expect(a.over).toBe(false);
    expect(a.shield).toBe(false);
    const b = newState();
    b.surge = 3;
    b.obstacles.push({ kind: 'trap', x: 24, w: 7, top: GROUND - 9, h: 9 });
    step(b, 0.016, seeded(1));
    expect(b.over).toBe(false);
    expect(b.obstacles.length).toBe(0);
  });

  it('collects coins and counts them in the score', () => {
    const s = newState();
    s.pickups.push({ kind: 'coin', x: 26, bottom: GROUND - 2 });
    step(s, 0.016, seeded(1));
    expect(s.coins).toBe(1);
    expect(score(s)).toBeGreaterThanOrEqual(3);
  });

  it('unlocks runners and trails by best score, with something free at the start', () => {
    expect(RUNNERS.filter((r) => unlocked(r.need, 0)).length).toBeGreaterThanOrEqual(1);
    expect(TRAILS.filter((t) => unlocked(t.need, 0)).length).toBeGreaterThanOrEqual(1);
    expect(TRAILS.every((t) => unlocked(t.need, 500))).toBe(true);
  });
});
