import { describe, expect, it } from 'vitest';
import { NAME_ADJECTIVES, NAME_NOUNS } from '../../supabase/functions/_shared/kid-auth.ts';
import { chatFlagged } from './demo-backend.ts';

describe('hero name words', () => {
  const all = [...NAME_ADJECTIVES, ...NAME_NOUNS] as string[];
  it('are single plain words with no repeats inside a list', () => {
    for (const w of all) expect(w).toMatch(/^[A-Z][a-z]{2,11}$/);
    expect(new Set(NAME_ADJECTIVES).size).toBe(NAME_ADJECTIVES.length);
    expect(new Set(NAME_NOUNS).size).toBe(NAME_NOUNS.length);
  });
  it('pass the chat word filter, alone and in every pairing', () => {
    for (const w of all) expect(chatFlagged(w), w).toBe(false);
    for (const a of NAME_ADJECTIVES) for (const n of NAME_NOUNS) expect(chatFlagged(`${a} ${n}`), `${a} ${n}`).toBe(false);
  });
  it('has plenty to pick from', () => {
    expect(NAME_ADJECTIVES.length).toBeGreaterThanOrEqual(100);
    expect(NAME_NOUNS.length).toBeGreaterThanOrEqual(100);
  });
});
