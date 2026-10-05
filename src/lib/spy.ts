// Shadow Spy: clues are one emoji from this palette, no typing. Must match spy_emoji() in the database.
export const SPY_EMOJI = ['🌞', '🌙', '⭐', '🔥', '💧', '🌳', '🍎', '🍕', '🐶', '🐱', '🐟', '🦁', '🚗', '🏠', '⚽', '🎵', '📚', '🎨', '🌈', '🔑', '👑', '💎', '🎁', '🚀'] as const;
export const isSpyEmoji = (s: string) => (SPY_EMOJI as readonly string[]).includes(s);
