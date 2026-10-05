// Chrono-Rift: events from science and history are scrambled by a time rift. Put them back in order.
// Each set lists its steps in the correct order; `when` (a year) is shown only after the answer is checked.
export interface RiftSet { id: string; subject: 'science' | 'history'; title: string; steps: { text: string; when?: string }[] }

const s = (text: string, when?: string) => ({ text, when });

export const RIFT_SETS: RiftSet[] = [
  { id: 'water-cycle', subject: 'science', title: 'The water cycle', steps: [s('The sun heats water into vapor (evaporation)'), s('Vapor cools into clouds (condensation)'), s('Rain or snow falls (precipitation)'), s('Water gathers in rivers and oceans (collection)')] },
  { id: 'photosynthesis', subject: 'science', title: 'How a plant makes food', steps: [s('Roots take in water'), s('Leaves take in carbon dioxide'), s('Sunlight powers the green chlorophyll'), s('Sugar is made and oxygen is released')] },
  { id: 'sci-method', subject: 'science', title: 'The scientific method', steps: [s('Ask a question'), s('Research and make a hypothesis'), s('Test it with an experiment'), s('Study the results'), s('Share your conclusion')] },
  { id: 'butterfly', subject: 'science', title: 'A butterfly grows up', steps: [s('Egg'), s('Caterpillar (larva)'), s('Chrysalis (pupa)'), s('Adult butterfly')] },
  { id: 'plant-life', subject: 'science', title: 'A plant life cycle', steps: [s('Seed'), s('Germination: the seed sprouts'), s('Seedling'), s('Mature plant with flowers'), s('Pollination makes new seeds')] },
  { id: 'rock-cycle', subject: 'science', title: 'The rock cycle', steps: [s('Weathering breaks rock into sediment'), s('Sediment is pressed into sedimentary rock'), s('Heat and pressure make metamorphic rock'), s('Melting makes magma'), s('Magma cools into igneous rock')] },
  { id: 'food-chain', subject: 'science', title: 'A food chain (energy flows up)', steps: [s('The Sun'), s('Grass'), s('Grasshopper'), s('Frog'), s('Hawk')] },
  { id: 'moon', subject: 'science', title: 'Moon phases after a new moon', steps: [s('New moon'), s('Waxing crescent'), s('First quarter'), s('Full moon'), s('Last quarter')] },
  { id: 'digestion', subject: 'science', title: 'Where food goes in your body', steps: [s('Mouth: teeth chew the food'), s('Esophagus carries it down'), s('Stomach breaks it down'), s('Small intestine absorbs nutrients'), s('Large intestine absorbs water')] },
  { id: 'volcano', subject: 'science', title: 'A volcano erupts', steps: [s('Pressure builds in the magma chamber'), s('Magma rises through the vent'), s('Gas pushes magma out'), s('Lava flows down the sides'), s('Lava cools into new rock')] },
  { id: 'frog', subject: 'science', title: 'A frog grows up', steps: [s('Eggs in the water'), s('Tadpole'), s('Tadpole grows legs'), s('Froglet'), s('Adult frog')] },
  { id: 'planets', subject: 'science', title: 'Planets from closest to the Sun', steps: [s('Mercury'), s('Venus'), s('Earth'), s('Mars'), s('Jupiter')] },

  { id: 'america', subject: 'history', title: 'Growing United States', steps: [s('Declaration of Independence is signed', '1776'), s('The Constitution is written', '1787'), s('The Louisiana Purchase', '1803'), s('The Civil War begins', '1861'), s('People land on the Moon', '1969')] },
  { id: 'old-world', subject: 'history', title: 'The ancient world and after', steps: [s('The Great Pyramid is built in Egypt', 'about 2560 BC'), s('The first Olympic Games in Greece', '776 BC'), s('Rome becomes an empire', '27 BC'), s('The western Roman Empire falls', '476'), s('Columbus reaches the Americas', '1492')] },
  { id: 'exploring', subject: 'history', title: 'Exploring and settling', steps: [s('Columbus reaches the Americas', '1492'), s("Magellan's crew sails around the world", '1522'), s('Jamestown is settled', '1607'), s('The Pilgrims land at Plymouth', '1620'), s('The Boston Tea Party', '1773')] },
  { id: 'rights', subject: 'history', title: 'Steps toward civil rights', steps: [s('The Emancipation Proclamation', '1863'), s('The 13th Amendment ends slavery', '1865'), s('Brown v. Board of Education', '1954'), s('Rosa Parks and the Montgomery bus boycott', '1955'), s('The Civil Rights Act', '1964')] },
  { id: 'flight', subject: 'history', title: 'Inventions that moved us', steps: [s('The Wright brothers fly', '1903'), s('Ford builds the Model T', '1908'), s('Lindbergh flies alone across the Atlantic', '1927'), s('People land on the Moon', '1969'), s('The first iPhone', '2007')] },
  { id: 'west', subject: 'history', title: 'Going west', steps: [s('The Louisiana Purchase', '1803'), s('Lewis and Clark set out', '1804'), s('Wagons head west on the Oregon Trail', 'the 1840s'), s('The California Gold Rush', '1849'), s('The Transcontinental Railroad is finished', '1869')] },
  { id: 'revolution', subject: 'history', title: 'Road to the Revolution', steps: [s('The French and Indian War ends', '1763'), s('The Stamp Act', '1765'), s('The Boston Tea Party', '1773'), s('Declaration of Independence is signed', '1776'), s('The Treaty of Paris ends the war', '1783')] },
  { id: 'inventions', subject: 'history', title: 'Big inventions', steps: [s('The printing press in Europe', 'about 1440'), s('The telescope', '1608'), s('The telephone', '1876'), s('The practical light bulb', '1879'), s('The World Wide Web', '1989')] },
  { id: 'presidents', subject: 'history', title: 'Presidents in order', steps: [s('George Washington'), s('Thomas Jefferson'), s('Abraham Lincoln'), s('Theodore Roosevelt'), s('Franklin D. Roosevelt')] },
];

export const ROUNDS = 5;
export const WIN_AT = 3;

/** Fisher-Yates with an injectable random so tests are steady. */
export function shuffle<T>(list: T[], rng: () => number = Math.random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** A scrambled order of step numbers that is never already correct. */
export function scramble(n: number, rng: () => number = Math.random): number[] {
  const base = Array.from({ length: n }, (_, i) => i);
  let out = shuffle(base, rng);
  for (let t = 0; t < 20 && out.every((v, i) => v === i); t++) out = shuffle(base, rng);
  if (out.every((v, i) => v === i)) out = [...base.slice(1), base[0]];
  return out;
}

/** A mix of science and history, one set each time it is used so a game never repeats a topic. */
export function pickRounds(n = ROUNDS, rng: () => number = Math.random): RiftSet[] {
  const sci = shuffle(RIFT_SETS.filter((x) => x.subject === 'science'), rng);
  const his = shuffle(RIFT_SETS.filter((x) => x.subject === 'history'), rng);
  const out: RiftSet[] = [];
  for (let i = 0; out.length < n; i++) { const next = i % 2 === 0 ? sci.pop() : his.pop(); if (next) out.push(next); else if (!sci.length && !his.length) break; }
  return shuffle(out, rng);
}

/** Which positions of the player's order (step numbers, left to right) are right. */
export function checkOrder(order: number[]): boolean[] { return order.map((v, i) => v === i); }

/** Swap two positions in the order, unless either is locked (already right on an earlier check). */
export function swap(order: number[], a: number, b: number, locked: boolean[] = []): number[] {
  if (a === b || locked[a] || locked[b]) return order;
  const next = [...order];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}
