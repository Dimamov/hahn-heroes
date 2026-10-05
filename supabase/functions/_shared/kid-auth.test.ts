import { describe, expect, it } from 'vitest';
import {
  HERO_CODE_ALPHABET, deriveKidPassword, formatHeroCode, generateHeroCode, heroDisplayName, isValidHeroCode,
  isValidPicture, normalizeHeroCode,
} from './kid-auth.ts';
import { schoolDate, schoolWeek } from './rewards.ts';

describe('hero codes', () => {
  it('generates valid 8-character codes from the friendly alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateHeroCode();
      expect(isValidHeroCode(code)).toBe(true);
      expect([...code].every((c) => HERO_CODE_ALPHABET.includes(c))).toBe(true);
    }
  });
  it('accepts codes typed with dashes, spaces and lowercase', () => {
    expect(normalizeHeroCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizeHeroCode(' ABCD EFGH ')).toBe('ABCDEFGH');
    expect(formatHeroCode('ABCDEFGH')).toBe('ABCD-EFGH');
  });
  it('rejects look-alike characters', () => {
    expect(isValidHeroCode('ABCDEFG0')).toBe(false);
    expect(isValidHeroCode('ABCDEFGI')).toBe(false);
    expect(isValidHeroCode('ABC')).toBe(false);
  });
});

describe('picture password', () => {
  it('needs 4 different pictures from 0 to 8 (sign-in also takes the older 3)', () => {
    expect(isValidPicture([0, 4, 8, 2])).toBe(true);
    expect(isValidPicture([0, 4, 8])).toBe(false);
    expect(isValidPicture([0, 4, 8], [3, 4])).toBe(true);
    expect(isValidPicture([0, 0, 8, 2])).toBe(false);
    expect(isValidPicture([0, 4])).toBe(false);
    expect(isValidPicture([0, 4, 9, 2])).toBe(false);
    expect(isValidPicture('012')).toBe(false);
  });
  it('derives a stable password that depends on the code, pictures and secret', async () => {
    const a = await deriveKidPassword('s'.repeat(32), 'ABCDEFGH', [1, 2, 3]);
    expect(await deriveKidPassword('s'.repeat(32), 'ABCDEFGH', [1, 2, 3])).toBe(a);
    expect(await deriveKidPassword('s'.repeat(32), 'ABCDEFGH', [3, 2, 1])).not.toBe(a);
    expect(await deriveKidPassword('t'.repeat(32), 'ABCDEFGH', [1, 2, 3])).not.toBe(a);
    expect(await deriveKidPassword('s'.repeat(32), 'ABCDEFGJ', [1, 2, 3])).not.toBe(a);
  });
});

describe('hero names', () => {
  it('only allows picker words', () => {
    expect(heroDisplayName('Brave', 'Comet')).toBe('Brave Comet');
    expect(heroDisplayName('Brave', 'Anything')).toBeNull();
  });
});

describe('school calendar', () => {
  it('starts weeks on Monday in school time', () => {
    expect(schoolWeek(new Date('2026-10-05T16:00:00Z'))).toBe('2026-10-05');
    expect(schoolWeek(new Date('2026-10-12T03:30:00Z'))).toBe('2026-10-05'); // Sunday night in New York
    expect(schoolWeek(new Date('2026-10-12T04:30:00Z'))).toBe('2026-10-12');
  });
  it('uses the school date, not UTC', () => {
    expect(schoolDate(new Date('2026-10-06T02:00:00Z'))).toBe('2026-10-05');
  });
});
