// Secret codes. Limits match the server.
export const CODE_LIMITS = { teacher: { coins: 5, xp: 25 }, sensei: { coins: 50, xp: 200 } } as const;
export const CODE_WORDS_A = ['BRAVE', 'SWIFT', 'BRIGHT', 'LUCKY', 'HAPPY', 'MIGHTY', 'SILLY', 'SUNNY', 'COSMIC', 'GLOWING', 'CLEVER', 'KIND', 'WILD', 'ROYAL', 'JOLLY', 'EPIC'];
export const CODE_WORDS_B = ['FOX', 'OWL', 'TIGER', 'COMET', 'DRAGON', 'PANDA', 'ROCKET', 'WOLF', 'EAGLE', 'NINJA', 'ROBOT', 'UNICORN', 'PHOENIX', 'DOLPHIN', 'FALCON', 'LION'];
export interface MadeCode { id: number; code: string; coins: number; xp: number; expiresAt: string; className: string | null; redeemed: number }
export type RedeemResult = { ok: true; coins: number; xp: number } | { ok: false; reason: 'not_found' | 'already_used' | 'too_many_tries' };
