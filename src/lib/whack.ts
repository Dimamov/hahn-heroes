// Whack-a-Shadow rules: 30 seconds, nine holes, shadows pop up and you tap them. Friendly Nexlings pop up too: leave them be.
export const WHACK_SECONDS = 30;
export const WHACK_HOLES = 9;
export const WHACK_WIN = 15;
export type Pop = { hole: number; kind: 'shadow' | 'nexling' };

/** How long a pop stays up, getting a little quicker as the game goes on (never under 550 ms). */
export const dwellMs = (secondsPlayed: number) => Math.max(550, 1000 - secondsPlayed * 15);

/** A new pop in a different hole. About one in six is a friendly Nexling. */
export function nextPop(prev: Pop | null, rng: () => number): Pop {
  let hole = Math.floor(rng() * WHACK_HOLES);
  if (prev && hole === prev.hole) hole = (hole + 1 + Math.floor(rng() * (WHACK_HOLES - 1))) % WHACK_HOLES;
  return { hole, kind: rng() < 1 / 6 ? 'nexling' : 'shadow' };
}

/** Whacking a shadow scores 1. Whacking a Nexling takes 1 back (never below 0). */
export const whackScore = (score: number, kind: Pop['kind']) => (kind === 'shadow' ? score + 1 : Math.max(0, score - 1));
