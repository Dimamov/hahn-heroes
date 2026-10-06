import { describe, expect, it } from 'vitest';
import type { WeekSummary } from './backend.ts';
import { recapBest, recapCheer, recapHasNews, recapWeeksBack } from './recap.ts';

const week = (o: Partial<WeekSummary> = {}): WeekSummary => ({ weekStart: '2026-10-05', daysActive: 0, answered: 0, correct: 0, subjects: [], points: 0, missions: 0, ...o });

describe('weekly recap', () => {
  it('shows on Sunday and Monday only', () => {
    expect(recapWeeksBack(new Date('2026-10-04T12:00:00'))).toBe(0); // Sunday
    expect(recapWeeksBack(new Date('2026-10-05T12:00:00'))).toBe(1); // Monday
    expect(recapWeeksBack(new Date('2026-10-07T12:00:00'))).toBeNull();
  });
  it('stays quiet for an empty week', () => {
    expect(recapHasNews(week())).toBe(false);
    expect(recapHasNews(week({ points: 3 }))).toBe(true);
  });
  it('picks a cheer and the best subject', () => {
    expect(recapCheer(week({ daysActive: 5, answered: 20, correct: 10 }))).toContain('every day');
    expect(recapCheer(week({ answered: 20, correct: 18 }))).toContain('accuracy');
    const subjects = [{ subject: 'math', answered: 4, correct: 2 }, { subject: 'science', answered: 5, correct: 5 }, { subject: 'vocab', answered: 2, correct: 2 }] as WeekSummary['subjects'];
    expect(recapBest(week({ subjects }))).toBe('science');
    expect(recapBest(week())).toBeNull();
  });
});
