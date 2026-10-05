import { describe, expect, it } from 'vitest';
import { SHADOW_WORDS, isCaught, newRound, tallyVotes } from './shadow-rules.ts';

describe('shadow rules', () => {
  it('has ten words in every category and a guess list that holds the word', () => {
    for (const words of Object.values(SHADOW_WORDS)) expect(words).toHaveLength(10);
    for (let i = 0; i < 30; i++) {
      const r = newRound(4);
      expect(r.options).toHaveLength(8);
      expect(r.options).toContain(r.word);
      expect(new Set(r.options).size).toBe(8);
      expect(r.shadow).toBeGreaterThanOrEqual(0);
      expect(r.shadow).toBeLessThan(4);
    }
  });
  it('catches the Shadow only with strictly the most votes', () => {
    expect(isCaught({ 0: 1, 2: 1, 3: 2 }, 1)).toBe(true);
    expect(isCaught({ 0: 1, 2: 3, 3: 2 }, 1)).toBe(false);
    expect(isCaught({ 0: 1, 1: 2, 2: 1, 3: 2 }, 1)).toBe(false);
    expect(isCaught({}, 1)).toBe(false);
    expect(tallyVotes({ 0: 2, 1: 2, 3: 0 }, 4)).toEqual([1, 0, 2, 0]);
  });
});
