// Kid sign-in rules shared by the app (demo mode) and the Supabase edge functions.
// Pure TypeScript with Web Crypto only, so it runs in browsers, Node and Deno.

/** Letters and digits kids won't mix up: no I, L, O, 0 or 1. */
export const HERO_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const HERO_CODE_LENGTH = 8;

/** Picture password: tap 4 different pictures out of 9, in order (3,024 combinations). Heroes made
 *  before 2026-10-05 still sign in with their 3 pictures (504 combinations). */
export const PICTURE_CHOICES = 9;
export const PICTURE_LENGTH = 4;
export const LEGACY_PICTURE_LENGTH = 3;

/** After 5 wrong tries a hero code rests for 15 minutes; 10 in a row an hour; 15 a day. */
export const MAX_FAILED_TRIES = 5;
export const LOCKOUT_MINUTES = 15;

export const STARTER_HERO_IDS = [
  'ana', 'isabella', 'anayah', 'luna', 'kacee',
  'g06', 'g07', 'g08', 'g09', 'g10',
  'b01', 'b02', 'b03', 'b04', 'b05', 'b06', 'b07', 'b08', 'b09', 'b10',
] as const;
export type StarterHeroId = (typeof STARTER_HERO_IDS)[number];

/** Hero names come from a picker, never free typing, so every name is school-safe. */
export const NAME_ADJECTIVES = [
  'Brave', 'Bright', 'Swift', 'Clever', 'Mighty', 'Cosmic', 'Glowing', 'Lucky',
  'Bold', 'Kind', 'Fearless', 'Radiant', 'Silent', 'Stellar', 'Thunder', 'Crystal',
  'Electric', 'Golden', 'Hidden', 'Shining', 'Rapid', 'Steady', 'Wild', 'Wise',
] as const;
export const NAME_NOUNS = [
  'Comet', 'Falcon', 'Phoenix', 'Wolf', 'Owl', 'Nova', 'Spark', 'Storm',
  'Tiger', 'Dragon', 'Star', 'Rocket', 'Ranger', 'Knight', 'Pilot', 'Fox',
  'Eagle', 'Lion', 'Panther', 'Guardian', 'Voyager', 'Blaze', 'Echo', 'Orbit',
] as const;

export function heroDisplayName(adjective: string, noun: string): string | null {
  if (!(NAME_ADJECTIVES as readonly string[]).includes(adjective)) return null;
  if (!(NAME_NOUNS as readonly string[]).includes(noun)) return null;
  return `${adjective} ${noun}`;
}

export function isStarterHero(id: unknown): id is StarterHeroId {
  return typeof id === 'string' && (STARTER_HERO_IDS as readonly string[]).includes(id);
}

export function isGrade(grade: unknown): grade is 5 | 6 {
  return grade === 5 || grade === 6;
}

/** New passwords are 4 pictures; sign-in also accepts the 3-picture passwords made earlier. */
export function isValidPicture(picture: unknown, lengths: number[] = [PICTURE_LENGTH]): picture is number[] {
  return (
    Array.isArray(picture) &&
    lengths.includes(picture.length) &&
    picture.every((p) => Number.isInteger(p) && p >= 0 && p < PICTURE_CHOICES) &&
    new Set(picture).size === picture.length
  );
}

/** Uppercases and strips spaces and dashes, so "abcd-efgh" and "ABCD EFGH" both work. */
export function normalizeHeroCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidHeroCode(code: string): boolean {
  if (code.length !== HERO_CODE_LENGTH) return false;
  return [...code].every((c) => HERO_CODE_ALPHABET.includes(c));
}

/** Shows a code the way it is printed on the hero card: ABCD-EFGH. */
export function formatHeroCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** A random code from the friendly alphabet: hero codes (8), parent link codes (8), class codes (6). */
export function generateCode(length: number, random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  // Rejection sampling keeps every letter equally likely.
  const limit = 256 - (256 % HERO_CODE_ALPHABET.length);
  let code = '';
  while (code.length < length) {
    for (const byte of random(new Uint8Array(16))) {
      if (byte < limit && code.length < length) code += HERO_CODE_ALPHABET[byte % HERO_CODE_ALPHABET.length];
    }
  }
  return code;
}

export const generateHeroCode = (random?: (bytes: Uint8Array) => Uint8Array): string => generateCode(HERO_CODE_LENGTH, random);

/** Kids have no email; their auth account uses a reserved address that can never receive mail. */
export function kidAuthEmail(code: string): string {
  return `${code.toLowerCase()}@kids.hahn-heroes.invalid`;
}

/**
 * The auth password is an HMAC of the hero code and picture sequence with a server-only secret.
 * Knowing the pictures alone is useless against the auth API, so every guess has to go through
 * the rate-limited sign-in function.
 */
export async function deriveKidPassword(secret: string, code: string, picture: number[]): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${code}:${picture.join('-')}`)));
  let bin = '';
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
