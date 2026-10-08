import { describe, expect, it } from 'vitest';
import { practiceBackend } from './practice.ts';

describe('Sensei practice views', () => {
  it('a practice student is already signed in', async () => {
    const b = await practiceBackend('student');
    const who = await b.restore();
    expect(who?.kind).toBe('hero');
  });
  it('a practice parent is already signed in', async () => {
    const b = await practiceBackend('parent');
    const who = await b.restore();
    expect(who?.kind === 'adult' && who.adult.role).toBe('parent');
  });
  it('practice views are separate from each other', async () => {
    const a = await practiceBackend('student');
    const b = await practiceBackend('student');
    const [x, y] = await Promise.all([a.restore(), b.restore()]);
    expect(x?.kind === 'hero' && y?.kind === 'hero' && x.hero.heroCode).not.toBe(undefined);
  });
});

describe('Sensei rickroll', () => {
  it('only the Sensei can send one, and heroes can see it', async () => {
    const b = await practiceBackend('student');
    await expect(b.senseiRickroll()).rejects.toThrow('only the Sensei');
    expect(await b.rickrollLatest()).toBeNull();
  });
});
