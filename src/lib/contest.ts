// Weekly room contest. The theme list and the point amounts match the server.
export const CONTEST_THEMES = ['Coziest room', 'Coolest room', 'Most colourful room', 'Most magical room', 'Best room for studying', 'Most Nexus-y room'] as const;
export const CONTEST_POINTS = { enter: 3, vote: 2, win: 10 } as const;
/** Theme for the school week starting on `week` (YYYY-MM-DD, a Monday). */
export const contestTheme = (week: string) => CONTEST_THEMES[((Math.round((Date.parse(week) - Date.parse('2026-01-05')) / 86400000) / 7) % 6 + 6) % 6];

export interface ContestEntry { hero: string; name: string; starter: string; layout: { item: string; cell: number }[]; mineVote: boolean }
export interface ContestState {
  theme: string; entered: boolean; hasRoom: boolean; voted: boolean; entries: ContestEntry[];
  last: { theme: string; entered: boolean; votes: number; won: boolean; claimed: boolean };
}
