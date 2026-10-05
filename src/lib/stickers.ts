// Sticker choices. Everything is picked from fixed lists (no free text), and the server checks the same lists.
export const STICKER_BGS = [
  { id: 'violet', color: '#7c3aed' }, { id: 'pink', color: '#ec4899' }, { id: 'cyan', color: '#06b6d4' },
  { id: 'gold', color: '#f59e0b' }, { id: 'mint', color: '#10b981' }, { id: 'sunset', color: '#f97316' },
] as const;
export const STICKER_FRAMES = ['plain', 'star', 'dots', 'neon'] as const;
export const STICKER_DECOS = ['⭐', '💎', '🔥', '🌈', '🎮', '🏆', '🐾', '🦄', '🚀', '🎵'] as const;
export const STICKER_WORDS = ['Hero!', 'Team Nexus', 'Brave', 'Awesome', 'Level up!', 'Best squad', 'Go go go', 'Cool', 'Nexus fan', 'Never give up'] as const;
export const STICKER_COST = 10;
export const STICKER_DAILY = 3;
export const STICKER_MAX = 30;

export interface Sticker { id: number; hero: string; bg: string; frame: string; deco: string; word: string }
export interface StickerBook { stickers: Sticker[]; madeToday: number }
export type StickerDesign = Omit<Sticker, 'id'>;
export const bgColor = (id: string) => STICKER_BGS.find((b) => b.id === id)?.color ?? STICKER_BGS[0].color;
