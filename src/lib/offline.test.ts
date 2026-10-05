import { describe, expect, it } from 'vitest';
import { cacheSet, cachedSet, dropFromCache, flushAnswers, looksOffline, queueAnswer, queuedAnswers } from './offline.ts';
import type { Backend } from './backend.ts';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const q = (id: string) => ({ id, subject: 'math' as const, skill: 's', prompt: 'p', choices: ['a', 'b'] });

describe('offline practice', () => {
  it('queues each answer once', () => {
    const s = mem();
    expect(queueAnswer({ hero: 'h1', id: 'q1', choice: 1, subject: 'math' }, s)).toBe(true);
    queueAnswer({ hero: 'h1', id: 'q1', choice: 0, subject: 'math' }, s);
    expect(queuedAnswers(s)).toEqual([{ hero: 'h1', id: 'q1', choice: 1, subject: 'math' }]);
  });

  it('keeps a set for offline use without answered questions', () => {
    const s = mem();
    cacheSet('h1', 'math', { questions: [q('a'), q('b'), q('c')], remaining: 5 }, s);
    dropFromCache('h1', 'math', 'a', s);
    queueAnswer({ hero: 'h1', id: 'b', choice: 0, subject: 'math' }, s);
    expect(cachedSet('h1', 'math', s)?.questions.map((x) => x.id)).toEqual(['c']);
    expect(cachedSet('h1', 'science', s)).toBeNull();
  });

  it('sends in order, drops refused answers and stops when still offline', async () => {
    const s = mem();
    for (const id of ['a', 'b', 'c', 'd']) queueAnswer({ hero: 'h1', id, choice: 0, subject: 'math' }, s);
    queueAnswer({ hero: 'h2', id: 'z', choice: 0, subject: 'math' }, s);
    const seen: string[] = [];
    const backend = {
      answerQuestion: async (id: string) => {
        seen.push(id);
        if (id === 'b') throw new Error('that question was not handed to you');
        if (id === 'c') throw new Error('Failed to fetch');
        return {};
      },
    } as unknown as Backend;
    expect(await flushAnswers(backend, 'h1', s)).toEqual({ sent: 1, left: 2 });
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(queuedAnswers(s).filter((x) => x.hero === 'h1').map((x) => x.id)).toEqual(['c', 'd']);
    expect(queuedAnswers(s).some((x) => x.hero === 'h2')).toBe(true);
  });

  it('tells a lost connection from a refusal', () => {
    expect(looksOffline(new Error('TypeError: Failed to fetch'))).toBe(true);
    expect(looksOffline(new Error('daily cap reached'))).toBe(false);
  });
});
