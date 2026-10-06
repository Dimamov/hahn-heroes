import type { WeekSummary } from './backend.ts';

/** Sunday shows this week's recap, Monday shows the week that just ended. Any other day, no recap. */
export function recapWeeksBack(d: Date): 0 | 1 | null {
  const day = d.getDay();
  return day === 0 ? 0 : day === 1 ? 1 : null;
}

export const recapHasNews = (w: WeekSummary) => w.answered > 0 || w.points > 0 || w.missions > 0;

/** One kind sentence for the recap card. */
export function recapCheer(w: WeekSummary): string {
  const pct = w.answered ? Math.round((100 * w.correct) / w.answered) : 0;
  if (w.daysActive >= 5) return '🔥 You practised almost every day. Amazing!';
  if (w.answered >= 10 && pct >= 80) return '🌟 Super accuracy this week!';
  if (w.missions > 0) return '🎯 You finished missions. Great teamwork!';
  return 'Nice work. Every question makes you stronger!';
}

/** The subject the hero did best in (at least 3 answers), or null. */
export function recapBest(w: WeekSummary): string | null {
  const s = w.subjects.filter((x) => x.answered >= 3).sort((a, b) => b.correct / b.answered - a.correct / a.answered)[0];
  return s ? s.subject : null;
}
