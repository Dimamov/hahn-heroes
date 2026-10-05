/** Shadow Signal rules shared by demo mode and the pass-the-device game. The real game runs on the server. */
export const SHADOW_WORDS: Record<string, string[]> = {
  Animals: ['lion', 'penguin', 'dolphin', 'kangaroo', 'octopus', 'owl', 'panda', 'shark', 'eagle', 'turtle'],
  Food: ['pizza', 'tacos', 'pancakes', 'popcorn', 'sushi', 'spaghetti', 'cupcake', 'burger', 'pretzel', 'ice cream'],
  School: ['backpack', 'locker', 'cafeteria', 'recess', 'library', 'gym', 'school bus', 'homework', 'microscope', 'calculator'],
  Places: ['beach', 'volcano', 'castle', 'jungle', 'desert', 'museum', 'space station', 'playground', 'farm', 'mountain'],
  Sports: ['soccer', 'basketball', 'swimming', 'skateboarding', 'tennis', 'volleyball', 'baseball', 'gymnastics', 'karate', 'bowling'],
  Space: ['comet', 'galaxy', 'rocket', 'astronaut', 'moon', 'telescope', 'meteor', 'satellite', 'alien', 'black hole'],
  Jobs: ['chef', 'firefighter', 'pilot', 'teacher', 'doctor', 'farmer', 'artist', 'detective', 'mechanic', 'scientist'],
  Nature: ['rainbow', 'thunder', 'snowflake', 'tornado', 'waterfall', 'forest', 'river', 'sunrise', 'fog', 'hurricane'],
  Fun: ['chess', 'puzzle', 'trampoline', 'treasure map', 'magic trick', 'video game', 'roller coaster', 'kite', 'sandcastle', 'board game'],
  Fantasy: ['dragon', 'ninja', 'samurai', 'wizard', 'robot', 'unicorn', 'knight', 'fairy', 'giant', 'treasure'],
  Music: ['guitar', 'drums', 'piano', 'violin', 'trumpet', 'microphone', 'concert', 'choir', 'flute', 'headphones'],
  Home: ['pillow', 'blanket', 'refrigerator', 'bookshelf', 'bathtub', 'doorbell', 'sofa', 'lamp', 'window', 'staircase'],
};

const rnd = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const shuffle = <T,>(a: T[]): T[] => [...a].sort(() => Math.random() - 0.5);

export interface Round { category: string; word: string; options: string[]; shadow: number }

/** A secret word, eight words from its category to guess from, and who the Shadow is (an index 0..players-1). */
export function newRound(players: number): Round {
  const category = rnd(Object.keys(SHADOW_WORDS));
  const word = rnd(SHADOW_WORDS[category]);
  const options = shuffle([word, ...shuffle(SHADOW_WORDS[category].filter((w) => w !== word)).slice(0, 7)]);
  return { category, word, options, shadow: Math.floor(Math.random() * players) };
}

/** The Shadow is caught only when they get strictly more votes than anyone else. Ties let them escape. */
export function isCaught(votes: Record<number, number>, shadow: number): boolean {
  const tally: Record<number, number> = {};
  for (const target of Object.values(votes)) tally[target] = (tally[target] ?? 0) + 1;
  const theirs = tally[shadow] ?? 0;
  const best = Math.max(0, ...Object.entries(tally).filter(([k]) => +k !== shadow).map(([, v]) => v));
  return theirs > 0 && theirs > best;
}

export const tallyVotes = (votes: Record<number, number>, players: number): number[] => {
  const out = Array<number>(players).fill(0);
  for (const target of Object.values(votes)) out[target] += 1;
  return out;
};

/** Bots give a vague one word clue. */
export const BOT_CLUES = ['big', 'fun', 'round', 'loud', 'shiny', 'old', 'fast', 'cool', 'sweet', 'tiny', 'popular', 'colorful'];
