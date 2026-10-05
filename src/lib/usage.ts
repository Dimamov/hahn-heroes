import type { UsageReport } from './backend.ts';

export type Verdict = 'keep' | 'watch' | 'hide' | 'unknown';
export interface UsageRow {
  id: string; label: string; icon: string; opens: number; players: number; cameBack: number;
  avgMinutes: number; prevOpens: number; hidden: boolean; verdict: Verdict; why: string;
}

/** Names for the parts of the app that are not games. */
export const FEATURE_LABELS: Record<string, [string, string]> = {
  learn: ['Learn', '📚'], practice: ['Practice', '✏️'], 'practice:math': ['Math practice', '🔢'], 'practice:vocab': ['Word Power practice', '🔤'],
  'practice:reading': ['Reading practice', '📚'], 'practice:science': ['Science practice', '🔬'],
  arcade: ['Arcade', '🕹️'], missions: ['Missions', '🎯'], 'missions-home': ['Home missions', '🏠'], 'missions-class': ['Class missions', '🏫'], quiz: ['Class quizzes', '📝'],
  squad: ['Squad', '👥'], house: ['House', '🏰'], hero: ['My Hero', '🦸'], room: ['My Room', '🛋️'], shop: ['Shop', '🛍️'], nexlings: ['Nexlings', '🐾'], cards: ['Cards', '🃏'],
  adventures: ['Adventures', '🗺️'], quest: ['Daily quest', '🧭'], showcase: ['Showcase', '⭐'], guide: ['Guide', '📖'], myweek: ['My week', '📊'], raid: ['Raid', '🐉'],
  stickers: ['Stickers', '🏷️'], comics: ['Comics', '💬'], contest: ['Contest', '🏆'], codes: ['Secret codes', '🔑'], badges: ['Badges', '🎖️'], race: ['Class race', '🏁'],
  kindness: ['Kindness', '💛'], studio: ['Studio', '🎨'], base: ['Squad base', '🏕️'], treasure: ['Treasure', '💰'], secret: ['Weekly secret', '✨'], announcements: ['Announcements', '📣'],
};
const SKIP = new Set(['home', 'profile', 'welcome', 'other', 'adult', 'parentcode', 'notifications']);

/** A fair call only once enough kids are playing. Below that, everything says "too early". */
export const MIN_KIDS = 5;

export function verdictFor(opens: number, players: number, cameBack: number, activeKids: number): { verdict: Verdict; why: string } {
  if (activeKids < MIN_KIDS) return { verdict: 'unknown', why: 'Too few kids so far to judge' };
  if (opens === 0) return { verdict: 'hide', why: 'Nobody played it' };
  const share = players / activeKids;
  if (share < 0.1) return { verdict: 'hide', why: 'Fewer than 1 in 10 kids played it' };
  if (share < 0.25) return { verdict: 'watch', why: 'Fewer than 1 in 4 kids played it' };
  if (players >= 5 && cameBack / players < 0.2) return { verdict: 'watch', why: 'Few kids came back to it' };
  return { verdict: 'keep', why: 'Kids like it' };
}

/** Every game, with zero rows for games nobody opened. Least played first. */
export function gameRows(r: UsageReport, games: readonly { id: string; label: string; icon: string }[]): UsageRow[] {
  const by = new Map(r.screens.map((s) => [s.screen, s]));
  return games.map((g) => {
    const s = by.get(`game:${g.id}`);
    const opens = s?.opens ?? 0, players = s?.players ?? 0, cameBack = s?.cameBack ?? 0;
    return {
      id: g.id, label: g.label, icon: g.icon, opens, players, cameBack,
      avgMinutes: opens ? Math.round(((s?.minutes ?? 0) / opens) * 10) / 10 : 0,
      prevOpens: s?.prevOpens ?? 0, hidden: r.hidden.includes(g.id), ...verdictFor(opens, players, cameBack, r.activeKids),
    };
  }).sort((a, b) => a.opens - b.opens || a.label.localeCompare(b.label));
}

/** The other screens (shop, Nexlings, Learn and so on), most used first. */
export function featureRows(r: UsageReport): UsageRow[] {
  return r.screens.filter((s) => !s.screen.startsWith('game:') && !SKIP.has(s.screen)).map((s) => {
    const [label, icon] = FEATURE_LABELS[s.screen] ?? [s.screen.replace(/[-_:]/g, ' '), '🔹'];
    return {
      id: s.screen, label, icon, opens: s.opens, players: s.players, cameBack: s.cameBack,
      avgMinutes: s.opens ? Math.round((s.minutes / s.opens) * 10) / 10 : 0, prevOpens: s.prevOpens, hidden: false, verdict: 'unknown' as Verdict, why: '',
    };
  }).sort((a, b) => b.opens - a.opens);
}

export const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? 'am' : 'pm'}`;

/** The busiest hours, as text like "4 pm, 7 pm". Empty when there is no data. */
export function peakHours(r: UsageReport, n = 3): string {
  return [...r.hours].filter((h) => h.minutes > 0).sort((a, b) => b.minutes - a.minutes).slice(0, n).sort((a, b) => a.hour - b.hour).map((h) => hourLabel(h.hour)).join(', ');
}

export const pctOf = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);
