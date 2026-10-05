import items from '../../content/shop.json';

export interface CatalogItem { id: string; kind: 'outfit' | 'accessory' | 'decor'; slot: string | null; name: string; icon: string; price: number; unlock_xp: number }
export const SHOP_ITEMS = items as CatalogItem[];
export const itemById = (id: string) => SHOP_ITEMS.find((i) => i.id === id);
export const WEAR_SLOTS = [
  { id: 'outfit', label: 'Outfit', icon: '🧥' },
  { id: 'hat', label: 'Head', icon: '🎩' },
  { id: 'face', label: 'Face', icon: '🕶️' },
  { id: 'back', label: 'Back', icon: '🦸' },
] as const;
export const ROOM_COLS = 6;
export const ROOM_ROWS = 4;
