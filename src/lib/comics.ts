// Comic choices. Everything is picked from fixed lists (no typing), and the server checks the same lists.
export const COMIC_SCENES = [
  { id: 'hall', label: 'Hall', color: '#6d5bd0' }, { id: 'forest', label: 'Forest', color: '#1f8f5a' }, { id: 'space', label: 'Space', color: '#1b1b4d' },
  { id: 'castle', label: 'Castle', color: '#8a6d3b' }, { id: 'beach', label: 'Beach', color: '#2aa7c9' }, { id: 'city', label: 'City', color: '#4b5563' },
] as const;
export const COMIC_POSES = ['stand', 'cheer', 'cool', 'power'] as const;
export const COMIC_LINES = [
  "Let's go!", 'Watch out!', 'I found it!', 'Nexus power!', 'Together we win!', 'That was close!', 'Look over there!', 'Awesome!',
  'Oh no!', 'We did it!', 'Follow me!', 'Great idea!', 'Help is here!', 'Time to learn!', 'Level up!', 'Ready?',
] as const;
export const COMIC_MAX = 10;

export interface ComicPanelData { hero: string; scene: string; pose: string; line: string }
export type ComicPanels = [ComicPanelData, ComicPanelData, ComicPanelData];
export interface Comic { id: number; panels: ComicPanels; shared?: boolean; maker?: string }
export const sceneColor = (id: string) => COMIC_SCENES.find((s) => s.id === id)?.color ?? COMIC_SCENES[0].color;
export const blankPanel = (hero: string): ComicPanelData => ({ hero, scene: 'hall', pose: 'stand', line: "Let's go!" });
