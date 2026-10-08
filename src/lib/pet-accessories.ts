// Pet accessories: free emoji extras your Nexling can wear, one per slot. Kept on this device only,
// so there is nothing to buy and nothing stored about other kids. Real art can replace the emoji later.

export type PetSlot = 'head' | 'face' | 'neck';
export interface PetAccessory { id: string; slot: PetSlot; icon: string; name: string }

export const PET_SLOTS: { id: PetSlot; label: string }[] = [
  { id: 'head', label: 'Head' },
  { id: 'face', label: 'Face' },
  { id: 'neck', label: 'Neck' },
];

export const PET_ACCESSORIES: PetAccessory[] = [
  { id: 'crown', slot: 'head', icon: '👑', name: 'Crown' },
  { id: 'cap', slot: 'head', icon: '🧢', name: 'Cap' },
  { id: 'party', slot: 'head', icon: '🥳', name: 'Party hat' },
  { id: 'wizard', slot: 'head', icon: '🧙', name: 'Wizard hat' },
  { id: 'flower', slot: 'head', icon: '🌸', name: 'Flower' },
  { id: 'shades', slot: 'face', icon: '🕶️', name: 'Sunglasses' },
  { id: 'glasses', slot: 'face', icon: '👓', name: 'Glasses' },
  { id: 'mustache', slot: 'face', icon: '🥸', name: 'Disguise' },
  { id: 'bow', slot: 'neck', icon: '🎀', name: 'Bow' },
  { id: 'scarf', slot: 'neck', icon: '🧣', name: 'Scarf' },
  { id: 'medal', slot: 'neck', icon: '🏅', name: 'Medal' },
  { id: 'star', slot: 'neck', icon: '⭐', name: 'Star charm' },
];

export type PetOutfit = Partial<Record<PetSlot, string>>;
const key = (heroId: string) => `hahn-pet-accessories:${heroId}`;

export function loadOutfit(heroId: string): PetOutfit {
  try {
    const raw = JSON.parse(localStorage.getItem(key(heroId)) ?? '{}') as Record<string, unknown>;
    const out: PetOutfit = {};
    for (const a of PET_ACCESSORIES) if (raw[a.slot] === a.id) out[a.slot] = a.id;
    return out;
  } catch { return {}; }
}
export function saveOutfit(heroId: string, o: PetOutfit): void {
  try { localStorage.setItem(key(heroId), JSON.stringify(o)); } catch { /* storage may be blocked */ }
}

/** Wear an accessory (it replaces whatever is in that slot) or take it off by choosing it again. */
export function toggleAccessory(o: PetOutfit, a: PetAccessory): PetOutfit {
  const next = { ...o };
  if (next[a.slot] === a.id) delete next[a.slot]; else next[a.slot] = a.id;
  return next;
}
export const accessoryIcon = (o: PetOutfit, slot: PetSlot): string | null =>
  PET_ACCESSORIES.find((a) => a.slot === slot && a.id === o[slot])?.icon ?? null;
