import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo-backend.ts';
import { SignInError } from './backend.ts';

const memoryStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const input = { grade: 5 as const, hero: 'ana', nameAdjective: 'Brave', nameNoun: 'Comet', picture: [0, 4, 8] };

describe('demo backend', () => {
  let storage: ReturnType<typeof memoryStorage>;
  let clock: Date;
  const make = () => createDemoBackend(storage, () => clock);
  beforeEach(() => {
    storage = memoryStorage();
    clock = new Date('2026-10-06T15:00:00Z');
  });

  it('creates a hero, remembers it after a reload, and signs out and back in', async () => {
    const a = make();
    const hero = await a.signUp(input);
    expect(hero.displayName).toBe('Brave Comet');
    expect((await make().restore())?.heroCode).toBe(hero.heroCode);

    await a.signOut();
    expect(await make().restore()).toBeNull();
    const again = await make().signIn(hero.heroCode.toLowerCase(), [0, 4, 8]);
    expect(again.id).toBe(hero.id);
  });

  it('rejects bad sign-up details', async () => {
    await expect(make().signUp({ ...input, nameNoun: 'Hax' })).rejects.toThrow();
    await expect(make().signUp({ ...input, picture: [1, 1, 1] })).rejects.toThrow();
    await expect(make().signUp({ ...input, hero: 'nobody' })).rejects.toThrow();
  });

  it('rests a hero after 5 wrong tries, then lets them back in', async () => {
    const b = make();
    const hero = await b.signUp(input);
    for (let i = 0; i < 5; i++) {
      await expect(b.signIn(hero.heroCode, [8, 4, 0])).rejects.toMatchObject({ kind: 'wrong' });
    }
    // Even the right pictures wait while the hero is resting.
    await expect(b.signIn(hero.heroCode, [0, 4, 8])).rejects.toMatchObject({ kind: 'resting' });
    clock = new Date(clock.getTime() + 16 * 60_000);
    expect((await b.signIn(hero.heroCode, [0, 4, 8])).id).toBe(hero.id);
  });

  it('does not reveal whether a code exists', async () => {
    await expect(make().signIn('ZZZZZZZZ', [0, 1, 2])).rejects.toBeInstanceOf(SignInError);
  });

  it('pays the daily reward once per school day', async () => {
    const b = make();
    await b.signUp(input);
    expect(await b.dailyStatus()).toEqual({ available: true, amount: 10 });
    expect(await b.claimDaily()).toEqual({ awarded: 10, duplicate: false });
    expect(await b.claimDaily()).toEqual({ awarded: 0, duplicate: true });
    expect((await b.balances()).coins).toBe(10);
    expect((await b.dailyStatus()).available).toBe(false);

    // A refresh (new backend over the same storage) can't double-pay either.
    expect(await make().claimDaily()).toEqual({ awarded: 0, duplicate: true });

    clock = new Date('2026-10-07T15:00:00Z');
    expect((await b.dailyStatus()).available).toBe(true);
    expect((await b.claimDaily()).awarded).toBe(10);
  });

  it('keeps each hero\'s points separate', async () => {
    const first = make();
    await first.signUp(input);
    await first.claimDaily();
    await first.signOut();
    const second = make();
    await second.signUp({ ...input, picture: [1, 2, 3] });
    expect((await second.balances()).coins).toBe(0);
  });
});
