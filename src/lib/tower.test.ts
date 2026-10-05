import { describe, expect, it } from 'vitest';
import { KINDS, LIVES, PATH, WAVES, foePos, isGrass, newState, placeHero, startWave, step, waveSize } from './tower.ts';

const run = (s: ReturnType<typeof newState>, seconds: number) => { for (let t = 0; t < seconds * 10 && s.phase === 'wave'; t++) s = step(s, 0.1); return s; };

describe('hero defense rules', () => {
  it('the road is joined up and grass is everything else', () => {
    for (let i = 1; i < PATH.length; i++) expect(Math.abs(PATH[i][0] - PATH[i - 1][0]) + Math.abs(PATH[i][1] - PATH[i - 1][1])).toBe(1);
    expect(isGrass(1, 2)).toBe(false);
    expect(isGrass(0, 0)).toBe(true);
    expect(isGrass(-1, 0)).toBe(false);
  });
  it('heroes cost energy and go on empty grass only', () => {
    let s = newState();
    expect(placeHero(s, 1, 2, 'spark')).toBe(s);
    s = placeHero(s, 0, 2, 'spark');
    expect(s.heroes).toHaveLength(1);
    expect(s.energy).toBe(60 - KINDS.spark.cost);
    expect(placeHero(s, 0, 2, 'spark')).toBe(s);
    expect(placeHero({ ...s, energy: 1 }, 0, 3, 'boom').heroes).toHaveLength(1);
  });
  it('an undefended wave costs lives; defended waves earn energy and move on', () => {
    const lost = run(startWave(newState()), 60);
    expect(lost.lives).toBeLessThan(LIVES);
    let s = newState();
    for (const c of [1, 2, 3, 4]) s = placeHero({ ...s, energy: 999 }, 0, c, 'spark');
    for (const c of [1, 2, 3, 4]) s = placeHero({ ...s, energy: 999 }, 2, c - 1 < 0 ? 0 : c - 1, 'spark');
    const done = run(startWave(s), 120);
    expect(done.phase).toBe('build');
    expect(done.lives).toBe(LIVES);
    expect(done.energy).toBeGreaterThan(0);
  });
  it('losing all lives ends the game and surviving the last wave wins', () => {
    const doomed = run(startWave({ ...newState(), lives: 1 }), 60);
    expect(doomed.phase).toBe('lost');
    const last = { ...newState(), wave: WAVES - 1 };
    let s = startWave(last);
    s = { ...s, toSpawn: 0 };
    expect(step(s, 0.1).phase).toBe('won');
    expect(waveSize(1)).toBeLessThan(waveSize(WAVES));
    expect(foePos(0)).toEqual([1, 0]);
  });
});
