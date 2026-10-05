/** ODIN card rules. The server holds the real game; this module drives demo mode and the card faces. */
export type OdinColor = 'R' | 'B' | 'G' | 'Y';
export const ODIN_COLORS: OdinColor[] = ['R', 'B', 'G', 'Y'];
export const COLOR_NAMES: Record<OdinColor, string> = { R: 'Red', B: 'Blue', G: 'Green', Y: 'Yellow' };

const VALUES = ['0', '1', '1', '2', '2', '3', '3', '4', '4', '5', '5', '6', '6', '7', '7', '8', '8', '9', '9', 'S', 'S', 'R', 'R', 'D', 'D'];

export function shuffle<T>(items: T[], rand: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newDeck(rand?: () => number): string[] {
  const cards = ODIN_COLORS.flatMap((c) => VALUES.map((v) => c + v));
  for (let i = 0; i < 4; i++) cards.push('W', 'W4');
  return shuffle(cards, rand);
}

export const isWild = (card: string) => card[0] === 'W';

export function playable(card: string, top: string, color: string): boolean {
  return isWild(card) || card[0] === color || (!isWild(top) && card.slice(1) === top.slice(1));
}

/** What to show on a card face. */
export function cardFace(card: string): { big: string; small: string } {
  if (card === 'W') return { big: '★', small: 'WILD' };
  if (card === 'W4') return { big: '+4', small: 'WILD' };
  const v = card.slice(1);
  if (v === 'S') return { big: '⊘', small: 'SKIP' };
  if (v === 'R') return { big: '⇄', small: 'REVERSE' };
  if (v === 'D') return { big: '+2', small: 'DRAW' };
  return { big: v, small: '' };
}

export function cardName(card: string): string {
  if (card === 'W') return 'Wild card';
  if (card === 'W4') return 'Wild draw four';
  const f = cardFace(card);
  return `${COLOR_NAMES[card[0] as OdinColor]} ${f.small ? f.small.toLowerCase() : f.big}`;
}

/** How many columns a hand of n cards uses, so every card fits on screen without scrolling. */
export function handColumns(n: number): number {
  return Math.min(8, Math.max(3, Math.ceil(Math.sqrt(n * 1.6))));
}

export interface OdinGame {
  deck: string[];
  discard: string[];
  color: OdinColor;
  order: string[];
  hands: Record<string, string[]>;
  turn: number;
  dir: 1 | -1;
  turnStart: number;
  winner: string | null;
}

export function deal(order: string[], handSize = 7, rand?: () => number): OdinGame {
  let deck = newDeck(rand);
  const hands: Record<string, string[]> = {};
  for (const id of order) { hands[id] = deck.slice(0, handSize); deck = deck.slice(handSize); }
  const first = deck.findIndex((c) => /^[RBGY][0-9]$/.test(c));
  const top = deck[first];
  deck = deck.filter((_, i) => i !== first);
  return { deck, discard: [top], color: top[0] as OdinColor, order, hands, turn: 0, dir: 1, turnStart: 0, winner: null };
}

function next(g: OdinGame, from: number, dir: number, steps: number, active: (id: string) => boolean): number {
  const n = g.order.length;
  let i = from;
  for (let s = 0; s < steps; s++) {
    for (let guard = 0; guard < n; guard++) {
      i = (((i + dir) % n) + n) % n;
      if (active(g.order[i])) break;
    }
  }
  return i;
}

export function draw(g: OdinGame, id: string, count: number, rand?: () => number) {
  if (g.deck.length < count && g.discard.length > 1) {
    const top = g.discard[g.discard.length - 1];
    g.deck = [...g.deck, ...shuffle(g.discard.slice(0, -1), rand)];
    g.discard = [top];
  }
  g.hands[id].push(...g.deck.splice(0, Math.min(count, g.deck.length)));
}

/** Plays a card (or draws one and passes when card is null). Throws the same messages the server does. */
export function move(g: OdinGame, id: string, card: string | null, color: string | null, now: number, active: (id: string) => boolean = () => true): void {
  if (g.winner) throw new Error('the game is over');
  if (g.order[g.turn] !== id) throw new Error('it is not your turn');
  if (card === null) {
    draw(g, id, 1);
    g.turn = next(g, g.turn, g.dir, 1, active); g.turnStart = now;
    return;
  }
  const hand = g.hands[id];
  const at = hand.indexOf(card);
  if (at < 0) throw new Error('you do not have that card');
  if (!playable(card, g.discard[g.discard.length - 1], g.color)) throw new Error('that card does not match');
  if (isWild(card) && !ODIN_COLORS.includes(color as OdinColor)) throw new Error('pick a colour');
  hand.splice(at, 1);
  g.discard.push(card);
  g.color = (isWild(card) ? color : card[0]) as OdinColor;
  if (hand.length === 0) { g.winner = id; return; }
  const value = card.slice(1);
  const activeCount = g.order.filter(active).length;
  let to = next(g, g.turn, g.dir, 1, active);
  if (card === 'W4' || value === 'D') {
    draw(g, g.order[to], card === 'W4' ? 4 : 2);
    to = next(g, to, g.dir, 1, active);
  } else if (value === 'S') {
    to = next(g, to, g.dir, 1, active);
  } else if (value === 'R') {
    g.dir = (g.dir * -1) as 1 | -1;
    to = next(g, g.turn, g.dir, activeCount === 2 ? 2 : 1, active);
  }
  g.turn = to; g.turnStart = now;
}

/** A simple bot: plays the first matching card (saving wilds for last) and picks its most common colour. */
export function botMove(g: OdinGame, id: string, now: number, active?: (id: string) => boolean): void {
  const hand = g.hands[id];
  const top = g.discard[g.discard.length - 1];
  const ok = hand.filter((c) => playable(c, top, g.color));
  const card = ok.find((c) => !isWild(c)) ?? ok[0] ?? null;
  const counts = ODIN_COLORS.map((c) => ({ c, n: hand.filter((h) => h[0] === c).length })).sort((a, b) => b.n - a.n);
  move(g, id, card, card && isWild(card) ? counts[0].c : null, now, active);
}
