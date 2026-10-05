// Hide and Seek rules (practice mode, mirrors the server): a 6 by 4 hall of props, one seeker per round.
export const HIDE = { hide: 20, seek: 40, reveal: 6, searches: 6, spots: 24, cols: 6 } as const;
export const HIDE_PROPS = ['🪴', '🛋️', '📚', '🖼️', '🕰️', '🧸', '🪑', '💡', '🎹', '🧺', '🪞', '🛏️', '🚪', '🪟', '🎒', '🏺', '🔭', '🧪', '🤖', '🌵', '🧳', '📦', '🎮', '🥁', '🪁', '🛹', '🎨', '⚽', '🏀', '🎲', '🧩', '📺', '🪜', '🛁', '🧯', '🔔', '🪣', '🎸', '🚲', '🛸'];

export interface HideGame {
  order: string[]; bots: string[]; round: number; phase: 'hide' | 'seek' | 'reveal' | 'done'; startedAt: number;
  layout: string[]; spots: Record<string, number>; caught: string[]; found: { spot: number; id: string }[];
  searched: number[]; sneaked: string[]; scores: Record<string, number>; botSearchAt?: number;
}
type Rng = () => number;

export function shuffled<T>(a: readonly T[], rng: Rng): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

export function newHideGame(players: { id: string; bot: boolean }[], now: number, rng: Rng = Math.random): HideGame {
  const order = shuffled(players.map((p) => p.id), rng);
  return {
    order, bots: players.filter((p) => p.bot).map((p) => p.id), round: 0, phase: 'hide', startedAt: now,
    layout: shuffled(HIDE_PROPS, rng).slice(0, HIDE.spots), spots: {}, caught: [], found: [], searched: [], sneaked: [],
    scores: Object.fromEntries(order.map((id) => [id, 0])),
  };
}

export const seekerOf = (g: HideGame) => g.order[Math.min(g.round, g.order.length - 1)];
const hidersOf = (g: HideGame) => g.order.filter((id) => id !== seekerOf(g));

/** Advances the clock and lets practice buddies act. Safe to call as often as you like. */
export function tickHide(g: HideGame, now: number, rng: Rng = Math.random): void {
  for (let guard = 0; guard < 8; guard++) {
    const hiders = hidersOf(g);
    if (g.phase === 'hide') {
      for (const b of g.bots) if (b !== seekerOf(g) && g.spots[b] === undefined) g.spots[b] = Math.floor(rng() * HIDE.spots);
      if (now >= g.startedAt + HIDE.hide * 1000 || hiders.every((h) => g.spots[h] !== undefined)) {
        for (const h of hiders) g.spots[h] ??= Math.floor(rng() * HIDE.spots);
        g.phase = 'seek'; g.startedAt = hiders.every((h) => g.spots[h] !== undefined) && now < g.startedAt + HIDE.hide * 1000 ? now : g.startedAt + HIDE.hide * 1000; g.botSearchAt = undefined;
      } else return;
    } else if (g.phase === 'seek') {
      const seeker = seekerOf(g);
      if (g.bots.includes(seeker)) {
        g.botSearchAt ??= g.startedAt + 3500;
        while (now >= g.botSearchAt && g.searched.length < HIDE.searches && g.caught.length < hiders.length) {
          const free = Array.from({ length: HIDE.spots }, (_, i) => i).filter((i) => !g.searched.includes(i));
          searchHide(g, seeker, free[Math.floor(rng() * free.length)], g.botSearchAt);
          g.botSearchAt += 3500;
        }
      }
      const allCaught = hiders.every((h) => g.caught.includes(h));
      if (allCaught || g.searched.length >= HIDE.searches || now >= g.startedAt + HIDE.seek * 1000) {
        g.scores[seeker] += 2 * g.caught.length + (allCaught ? 2 : 0);
        for (const h of hiders) if (!g.caught.includes(h)) g.scores[h] += 2;
        g.phase = 'reveal'; g.startedAt = Math.min(now, g.startedAt + HIDE.seek * 1000);
      } else return;
    } else if (g.phase === 'reveal') {
      if (now < g.startedAt + HIDE.reveal * 1000) return;
      const next = g.startedAt + HIDE.reveal * 1000;
      if (g.round + 1 >= g.order.length) { g.phase = 'done'; return; }
      g.round += 1; g.phase = 'hide'; g.startedAt = next; g.spots = {}; g.caught = []; g.found = []; g.searched = []; g.sneaked = [];
    } else return;
  }
}

const okSpot = (n: number) => Number.isInteger(n) && n >= 0 && n < HIDE.spots;

export function moveHide(g: HideGame, me: string, spot: number): void {
  if (!okSpot(spot)) throw new Error('pick a spot in the hall');
  if (seekerOf(g) === me) throw new Error('you are the seeker');
  if (g.phase === 'hide') { g.spots[me] = spot; return; }
  if (g.phase !== 'seek') throw new Error('not now');
  if (g.caught.includes(me)) throw new Error('you were found');
  if (g.sneaked.includes(me)) throw new Error('you already sneaked');
  if (g.spots[me] === spot) throw new Error('pick a different spot');
  g.spots[me] = spot; g.sneaked.push(me);
}

export function searchHide(g: HideGame, me: string, spot: number, _now?: number): number {
  if (g.phase !== 'seek' || seekerOf(g) !== me) throw new Error('it is not your search');
  if (!okSpot(spot)) throw new Error('pick a spot in the hall');
  if (g.searched.includes(spot)) throw new Error('you already checked there');
  let n = 0;
  for (const [id, s] of Object.entries(g.spots)) if (s === spot && !g.caught.includes(id)) { g.caught.push(id); g.found.push({ spot, id }); n++; }
  g.searched.push(spot);
  return n;
}
