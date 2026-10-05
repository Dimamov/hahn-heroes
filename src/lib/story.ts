import episodes from '../../content/story.json';

export interface StoryOption { id: string; label: string; after: string }
export type StoryPanel =
  | { kind: 'scene'; bg: string; text: string; art?: string; name?: string; who?: string[] }
  | { kind: 'choice'; id: string; bg: string; text: string; art?: string; options: StoryOption[] }
  | { kind: 'quiz'; id: string; bg: string; q: string; choices: string[]; mentor: string; tip: string }
  | { kind: 'end'; bg: string; text: string; art?: string };
export interface StoryEpisode { id: string; title: string; blurb: string; panels: StoryPanel[] }

export const EPISODES = episodes as StoryEpisode[];
export const episodeById = (id: string) => EPISODES.find((e) => e.id === id);

/** Where a reader of this episode has got to, as stored on the server. */
export interface StoryProgress { episode: string; panel: number; completed: boolean; choices: Record<string, string>; solved: string[] }
export interface StoryAnswerResult { correct: boolean; rightChoice?: number; explanation?: string; first?: boolean }
export interface StoryChoiceResult { repeat: boolean; option: string; currency?: string; amount?: number }
export interface StoryDone { repeat: boolean; card: string; coins?: number }
