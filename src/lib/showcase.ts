/** Badge titles a hero can earn, and the poses they can strike. The server decides which titles are unlocked. */
export const TITLES = [
  { id: 'rookie', label: 'Rookie Hero', icon: '🌱', hint: 'Everyone starts here.' },
  { id: 'keeper', label: 'Story Keeper', icon: '📖', hint: 'Finish a story episode.' },
  { id: 'detective', label: 'Detective', icon: '🔍', hint: 'Solve a Mystery Lab case.' },
  { id: 'chronicler', label: 'Chronicler', icon: '📜', hint: 'Finish the Chronicle Quest.' },
  { id: 'streak', label: 'Streak Star', icon: '🔥', hint: 'Reach a 7 day streak and collect it.' },
  { id: 'collector', label: 'Card Collector', icon: '🃏', hint: 'Own 20 different cards.' },
  { id: 'helper', label: 'House Helper', icon: '🏰', hint: 'Collect a House challenge reward.' },
  { id: 'scholar', label: 'Nexus Scholar', icon: '🎓', hint: 'Earn 500 XP.' },
] as const;
export const POSES = [
  { id: 'stand', label: 'Stand tall' },
  { id: 'cheer', label: 'Cheer' },
  { id: 'cool', label: 'Cool' },
  { id: 'power', label: 'Power up' },
] as const;
export type Pose = (typeof POSES)[number]['id'];
export const titleById = (id: string) => TITLES.find((t) => t.id === id) ?? TITLES[0];

/** Emotes are short moves unlocked by XP. The server checks the XP. */
export const EMOTES = [
  { id: 'wave', label: 'Wave', icon: '👋', xp: 0 },
  { id: 'spin', label: 'Spin', icon: '🌀', xp: 50 },
  { id: 'dance', label: 'Dance', icon: '💃', xp: 150 },
  { id: 'flex', label: 'Flex', icon: '💪', xp: 300 },
  { id: 'bow', label: 'Bow', icon: '🙇', xp: 500 },
  { id: 'jump', label: 'Victory jump', icon: '🎉', xp: 800 },
] as const;
export type EmoteId = (typeof EMOTES)[number]['id'];
export const emoteClass = (id: string) => `emote-${EMOTES.some((e) => e.id === id) ? id : 'wave'}`;

export interface ShowcaseState { title: string; pose: Pose; emote: EmoteId; xp: number; unlocked: string[] }
