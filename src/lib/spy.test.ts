import { describe, expect, it } from 'vitest';
import { SPY_EMOJI, isSpyEmoji } from './spy.ts';

describe('shadow spy palette', () => {
  it('only accepts the palette emoji', () => {
    expect(SPY_EMOJI).toHaveLength(24);
    expect(isSpyEmoji('🍕')).toBe(true);
    expect(isSpyEmoji('💩')).toBe(false);
    expect(isSpyEmoji('pizza')).toBe(false);
  });
});
