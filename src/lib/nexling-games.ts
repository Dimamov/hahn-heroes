// Rules for the Nexling play games. These are just for fun: they never touch points or growth.

/** Weekend races: open on Saturday and Sunday. */
export const isRaceDay = (d: Date): boolean => d.getDay() === 0 || d.getDay() === 6;

/** Hide and seek: where the Nexling hides in each round (one of `spots`), never the same spot twice in a row. */
export function hidingSpots(rounds: number, spots: number, rand: () => number = Math.random): number[] {
  const out: number[] = [];
  for (let i = 0; i < rounds; i++) {
    let s = Math.floor(rand() * spots);
    if (i > 0 && s === out[i - 1]) s = (s + 1) % spots;
    out.push(s);
  }
  return out;
}

/** Feeding: treats the Nexling loves (+1) and ones it does not (-1). */
export const LOVED = ['🍎', '🍓', '🍪', '🍩', '🍇'];
export const NOT_LOVED = ['🥦', '🧅', '🌶️'];
export function nextTreat(rand: () => number = Math.random): { icon: string; good: boolean } {
  const good = rand() < 0.7;
  const list = good ? LOVED : NOT_LOVED;
  return { icon: list[Math.floor(rand() * list.length)], good };
}

/** Race: each rival runs at a steady pace (percent of the track per second); taps push the hero forward. */
export const RIVALS = [{ name: 'Pip', icon: '🐇', pace: 7 }, { name: 'Dot', icon: '🐢', pace: 5 }, { name: 'Zip', icon: '🦊', pace: 8.5 }];
export const TAP_BOOST = 1.6;
export const raceProgress = (taps: number): number => Math.min(100, taps * TAP_BOOST);
export const rivalProgress = (pace: number, seconds: number): number => Math.min(100, pace * seconds);
/** 1 for first place, up to 4. */
export function racePlace(hero: number, seconds: number): number {
  return 1 + RIVALS.filter((r) => rivalProgress(r.pace, seconds) > hero).length;
}
