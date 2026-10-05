// Weekly treasure hunt. The places and prizes match the server's treasure_def.
export interface Hunt { title: string; card: string; steps: { place: string; clue: string }[] }
export const HUNTS: Hunt[] = [
  { title: 'Moonlight Trail', card: 'r-portal', steps: [
    { place: 'quest', clue: 'Three small tasks a day and a streak that grows. Where do heroes check their goals?' },
    { place: 'room', clue: 'I am where you sleep and keep your treasures. Friends can visit me.' },
    { place: 'cards', clue: 'I am full of heroes to collect, in shiny packs.' },
    { place: 'nexlings', clue: 'A tiny friend that grows with you and loves your points.' },
  ] },
  { title: 'Crystal Quest', card: 'r-crystal', steps: [
    { place: 'learn', clue: 'Math, words and science live here. It is where brains get stronger.' },
    { place: 'hero', clue: 'Hats, outfits and skills are tried on here.' },
    { place: 'squad', clue: 'Together we are stronger. Find where your team gathers.' },
    { place: 'arcade', clue: 'Games, games, games! The fun machines live here.' },
  ] },
  { title: 'Portal Path', card: 'r-luna', steps: [
    { place: 'profile', clue: 'Tap the little face in the top corner. Who is the hero?' },
    { place: 'comics', clue: 'Panels and speech bubbles tell a story here.' },
    { place: 'stickers', clue: 'Make little pictures to give to friends.' },
    { place: 'badges', clue: 'A shelf of silly trophies. How many have you won?' },
  ] },
  { title: "Keeper's Map", card: 'r-kacee', steps: [
    { place: 'cards', clue: 'Heroes on paper! Look where the collection lives.' },
    { place: 'arcade', clue: 'Pick a game, any game. This is where they are all kept.' },
    { place: 'room', clue: 'Place a lamp, a plant, a rug. Make it yours.' },
    { place: 'learn', clue: 'The last stop is where the smartest heroes practise.' },
  ] },
];
export const TREASURE_COIN = 2;
export const huntIndex = (week: string) => ((Math.round((Date.parse(week) - Date.parse('2026-01-05')) / 86400000) / 7) % 4 + 4) % 4;
export interface TreasureState { hunt: number; step: number; steps: number; done: boolean; claimed: boolean; card: string }
