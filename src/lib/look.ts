// Avatar studio choices. Everything is picked from fixed lists; the server checks the same lists.
export const HAIR = [
  { id: 'black', color: '#1f1f2a' }, { id: 'brown', color: '#6b3f1d' }, { id: 'blonde', color: '#e8c35a' }, { id: 'red', color: '#c2410c' },
  { id: 'pink', color: '#ec4899' }, { id: 'blue', color: '#3b82f6' }, { id: 'purple', color: '#8b5cf6' }, { id: 'green', color: '#22c55e' },
] as const;
export const MAKEUP = [
  { id: 'none', label: 'None', icon: '' }, { id: 'sparkle', label: 'Sparkle', icon: '✨' }, { id: 'rosy', label: 'Rosy', icon: '🌸' },
  { id: 'glam', label: 'Glam', icon: '💄' }, { id: 'neon', label: 'Neon', icon: '🌈' }, { id: 'cool', label: 'Cool', icon: '😎' },
] as const;
export const AURAS = [
  { id: 'none', label: 'None', color: 'transparent' }, { id: 'flame', label: 'Flame', color: '#f97316' }, { id: 'ice', label: 'Ice', color: '#67e8f9' },
  { id: 'star', label: 'Star', color: '#fde047' }, { id: 'rainbow', label: 'Rainbow', color: '#f472b6' }, { id: 'shadow', label: 'Shadow', color: '#7c3aed' },
  { id: 'leaf', label: 'Leaf', color: '#4ade80' },
] as const;
export const hairColor = (id: string) => HAIR.find((h) => h.id === id)?.color ?? HAIR[1].color;
export const auraColor = (id: string) => AURAS.find((a) => a.id === id)?.color ?? 'transparent';

export interface Look { hair: string; makeup: string; aura: string; outfit: string | null; accessory: string | null }
export interface LookState extends Look { pinned: boolean; likes: number; outfits: string[]; accessories: string[] }
export interface GalleryLook extends Look { hero: string; name: string; starter: string; likes: number; liked: boolean }
export const DEFAULT_LOOK: Look = { hair: 'brown', makeup: 'none', aura: 'none', outfit: null, accessory: null };
