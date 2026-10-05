// Working versions of the seven Nexling types. Names and art are not final; keep this in step with nexling_types in the database.
export interface NexlingType { id: string; name: string; icon: string; element: string; bonus: string; blurb: string }
export const NEXLING_TYPES: NexlingType[] = [
  { id: 'emberling', name: 'Emberling', icon: '🔥', element: 'Flame', bonus: 'learning', blurb: 'Loves a good brain workout. Grows extra from Learn practice.' },
  { id: 'zephling', name: 'Zephling', icon: '🌪️', element: 'Wind', bonus: 'game', blurb: 'Fast and playful. Grows extra from arcade games.' },
  { id: 'tideling', name: 'Tideling', icon: '🌊', element: 'Tide', bonus: 'class_mission', blurb: 'Calm and focused. Grows extra from class missions.' },
  { id: 'mossling', name: 'Mossling', icon: '🌿', element: 'Earth', bonus: 'home_mission', blurb: 'Helpful at home. Grows extra from home missions.' },
  { id: 'frostling', name: 'Frostling', icon: '❄️', element: 'Frost', bonus: 'streak', blurb: 'Keeps its cool. Grows extra from streaks.' },
  { id: 'sparkling', name: 'Sparkling', icon: '⚡', element: 'Storm', bonus: 'daily', blurb: 'Always on time. Grows extra from the daily check-in.' },
  { id: 'glimmerling', name: 'Glimmerling', icon: '✨', element: 'Light', bonus: 'event', blurb: 'Shines at big moments. Grows extra from events.' },
].sort((a, b) => a.name.localeCompare(b.name));
export const NEXLING_STAGES = [0, 100, 400, 1000];
export const STAGE_NAMES = ['Hatchling', 'Youngling', 'Guardian', 'Protector'];
export const nexlingType = (id: string) => NEXLING_TYPES.find((t) => t.id === id);
/** Growth is measured in coins earned since adopting, with a 1.5x bonus on the type's own source. */
export const NEXLING_BONUS = 1.5;
