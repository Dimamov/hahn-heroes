import { STARTER_HERO_IDS, type StarterHeroId } from '../../supabase/functions/_shared/kid-auth.ts';

export interface HeroInfo {
  id: StarterHeroId;
  label: string;
  body: 'girl' | 'boy';
  /** True once the finished artwork has been delivered; others show the template placeholder. */
  hasArt: boolean;
  squad: boolean;
}

const LABELS: Record<StarterHeroId, string> = {
  ana: 'Ana', isabella: 'Isabella', anayah: 'Anayah', luna: 'Luna', kacee: 'Kacee',
  g06: 'Hero 6', g07: 'Hero 7', g08: 'Hero 8', g09: 'Hero 9', g10: 'Hero 10',
  b01: 'Spiky Hair', b02: 'Fade', b03: 'Wavy Hair', b04: 'Swept Hair', b05: 'Freckles',
  b06: 'Neat Hair', b07: 'Twists', b08: 'Curls', b09: 'Long Hair', b10: 'Glasses',
};
const WITH_ART: readonly string[] = ['ana', 'isabella', 'anayah', 'luna', 'kacee'];

export const HEROES: HeroInfo[] = STARTER_HERO_IDS.map((id) => ({
  id,
  label: LABELS[id],
  body: id.startsWith('b') ? 'boy' : 'girl',
  hasArt: WITH_ART.includes(id),
  squad: ['ana', 'isabella', 'anayah', 'luna', 'kacee'].includes(id),
}));

export const heroById = (id: string): HeroInfo => HEROES.find((h) => h.id === id) ?? HEROES[0];

/** Nine pictures for the picture password. */
export const PICTURES = ['🚀', '🐺', '🦉', '🔥', '⭐', '🌙', '⚡', '🐉', '🍀'] as const;
