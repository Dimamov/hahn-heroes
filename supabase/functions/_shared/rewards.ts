// Reward rules shared by the app and the server. The database (award() in the foundation
// migration) is the source of truth; these mirror its defaults for demo mode and display.

export const CURRENCIES = ['coins', 'xp', 'skill_points', 'nexling_growth', 'house_score'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const SOURCES = [
  'home_mission', 'class_mission', 'learning', 'game', 'daily', 'streak', 'event', 'sensei', 'purchase', 'adjustment',
] as const;
export type RewardSource = (typeof SOURCES)[number];

/** Nexus points from missions are capped per school week, Monday to Sunday. */
export const WEEKLY_CAPS: Partial<Record<RewardSource, number>> = { home_mission: 500, class_mission: 500, learning: 150, game: 100 };
export const DAILY_LOGIN_COINS = 10;
export const SCHOOL_TIMEZONE = 'America/New_York';

/** Local calendar date (YYYY-MM-DD) in the school's time zone. */
export function schoolDate(at: Date, timeZone = SCHOOL_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** The Monday (YYYY-MM-DD) that starts the school week containing `at`. */
export function schoolWeek(at: Date, timeZone = SCHOOL_TIMEZONE): string {
  const day = new Date(`${schoolDate(at, timeZone)}T00:00:00Z`);
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - sinceMonday);
  return day.toISOString().slice(0, 10);
}

/** Class missions pass at 80%. 100% earns the full amount, 90% earns 80% of it, 80% earns 60%. */
export const CLASS_PASS_PERCENT = 80;
export function classMissionCoins(maxCoins: number, scorePct: number): number {
  if (scorePct < CLASS_PASS_PERCENT) return 0;
  return Math.max(1, Math.round((maxCoins * (scorePct - 50)) / 50));
}

/** Practice rewards: each question pays once, so the total is bounded by the question pool. */
export const LEARNING_REWARDS = { coins: 2, xp: 5, skillPoints: 1, setSize: 5, resumeMinutes: 30 } as const;

/** Solo arcade: each listed game pays once per school day. Small on purpose; learning is the way to earn. */
export const ARCADE_REWARDS = { coins: 5, xp: 3, games: ['pattern-pulse', 'memory-flip', 'word-builder', 'spot-difference', 'whack-shadow', 'bubble-pop', 'block-blast'] } as const;
