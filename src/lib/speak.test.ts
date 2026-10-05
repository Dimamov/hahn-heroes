import { describe, expect, it } from 'vitest';
import { rankVoices } from './speak.ts';

describe('read-aloud voices', () => {
  it('puts natural English voices first and hides other languages and novelty voices', () => {
    const ranked = rankVoices([
      { name: 'Fred', lang: 'en-US' }, { name: 'Anna', lang: 'de-DE' }, { name: 'Alex', lang: 'en-US' },
      { name: 'Google US English', lang: 'en-US' }, { name: 'Samantha (Enhanced)', lang: 'en-US' }, { name: 'Daniel', lang: 'en-GB' },
    ]);
    expect(ranked.map((v) => v.name)).toEqual(['Samantha (Enhanced)', 'Google US English', 'Daniel', 'Alex']);
  });
});
