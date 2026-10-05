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

/** Pet Park: dance party. Tap on the beat; how far off the beat (in ms) decides the cheer. */
export const BEAT_MS = 600;
export function danceJudge(offsetMs: number): 'perfect' | 'good' | 'miss' {
  const d = Math.abs(offsetMs);
  return d <= 120 ? 'perfect' : d <= 250 ? 'good' : 'miss';
}
/** How far (in ms) a tap at `t` is from the nearest beat, beats being every BEAT_MS from 0. */
export const beatOffset = (t: number): number => { const m = ((t % BEAT_MS) + BEAT_MS) % BEAT_MS; return Math.min(m, BEAT_MS - m); };

/** Pet Park: fetch. The ball swings back and forth (0 to 1); tap while it is in the glowing middle. */
export const FETCH_ZONE: readonly [number, number] = [0.4, 0.6];
export const ballPos = (tMs: number, periodMs = 1400): number => { const x = ((tMs % periodMs) / periodMs) * 2; return x <= 1 ? x : 2 - x; };
export const fetchHit = (pos: number): boolean => pos >= FETCH_ZONE[0] && pos <= FETCH_ZONE[1];

/** Pet Park: bubble bath. Each scrub counts only when the finger moved far enough. */
export const SCRUBS_NEEDED = 24;
export const SILLY_HATS = ['🎩', '👑', '🧢', '🎓', '👒', '🪖', '⛑️', '🤠', '🎅', '🧙'];
