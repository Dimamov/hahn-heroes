import cards from '../../content/cards.json';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export interface CardDef { id: string; name: string; rarity: Rarity; icon: string; art?: string; flavor: string }
export const CARDS = cards as CardDef[];
export const cardById = (id: string) => CARDS.find((c) => c.id === id);
export const RARITIES: { id: Rarity; label: string; color: string; value: number }[] = [
  { id: 'common', label: 'Common', color: '#94a3b8', value: 1 },
  { id: 'uncommon', label: 'Uncommon', color: '#34d399', value: 3 },
  { id: 'rare', label: 'Rare', color: '#38bdf8', value: 8 },
  { id: 'epic', label: 'Epic', color: '#a78bfa', value: 20 },
  { id: 'legendary', label: 'Legendary', color: '#fbbf24', value: 50 },
];
export const rarityInfo = (r: Rarity) => RARITIES.find((x) => x.id === r)!;

export interface OfferItem { card: string; qty: number }
export type FairLevel = 'empty' | 'blocked' | 'uneven' | 'ok';

/** Mirrors trade_value() and trade_fairness() in the database. A card the receiver already owns is worth half. */
export function tradeValue(offer: OfferItem[], receiverOwns: (card: string) => boolean): number {
  return offer.reduce((sum, o) => {
    const def = cardById(o.card);
    return def ? sum + rarityInfo(def.rarity).value * o.qty * (receiverOwns(o.card) ? 0.5 : 1) : sum;
  }, 0);
}
export function fairness(offerA: OfferItem[], offerB: OfferItem[], aOwns: (c: string) => boolean, bOwns: (c: string) => boolean): { level: FairLevel; givingMore: 'a' | 'b' | null } {
  const va = tradeValue(offerA, bOwns), vb = tradeValue(offerB, aOwns);
  const hi = Math.max(va, vb), lo = Math.min(va, vb);
  const level: FairLevel = hi === 0 ? 'empty' : lo === 0 ? 'blocked' : hi / lo >= 4 && hi - lo >= 6 ? 'blocked' : hi / lo >= 1.5 && hi - lo >= 2 ? 'uneven' : 'ok';
  return { level, givingMore: va > vb ? 'a' : vb > va ? 'b' : null };
}
export const UNEVEN_WARNING = 'Hold up! This trade looks uneven. You may be giving away more than you’re getting. Are you sure?';
