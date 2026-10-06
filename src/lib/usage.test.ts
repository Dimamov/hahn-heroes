import { describe, expect, it } from 'vitest';
import type { UsageReport } from './backend.ts';
import { featureRows, gameRows, hourLabel, peakHours, verdictFor } from './usage.ts';

const base = (over: Partial<UsageReport> = {}): UsageReport => ({
  month: '2026-10-01', since: '2026-10-01', heroesTotal: 40, activeKids: 20, hidden: [], screens: [], weeks: [], hours: [], subjects: [], thumbs: {}, streaks: { one: 0, few: 0, many: 0, daily: 0 }, run3: 0, ...over,
});
const GAMES = [{ id: 'a', label: 'Alpha', icon: '🅰️' }, { id: 'b', label: 'Beta', icon: '🅱️' }, { id: 'c', label: 'Gamma', icon: '🌀' }];

describe('usage report helpers', () => {
  it('waits for enough kids before judging', () => {
    expect(verdictFor(0, 0, 0, 3).verdict).toBe('unknown');
  });
  it('suggests hiding games almost nobody plays', () => {
    expect(verdictFor(0, 0, 0, 20)).toMatchObject({ verdict: 'hide', why: 'Nobody played it' });
    expect(verdictFor(3, 1, 0, 20).verdict).toBe('hide');
    expect(verdictFor(9, 4, 2, 20).verdict).toBe('watch');
    expect(verdictFor(40, 12, 1, 20).verdict).toBe('watch');
    expect(verdictFor(80, 14, 9, 20).verdict).toBe('keep');
  });
  it('lists every game, including ones nobody opened, least played first', () => {
    const r = base({ screens: [{ screen: 'game:a', opens: 30, players: 12, cameBack: 8, minutes: 60, prevOpens: 10 }, { screen: 'game:b', opens: 2, players: 1, cameBack: 0, minutes: 2, prevOpens: 0 }] });
    const rows = gameRows(r, GAMES);
    expect(rows.map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(rows[0]).toMatchObject({ opens: 0, verdict: 'hide' });
    expect(rows[2]).toMatchObject({ avgMinutes: 2, prevOpens: 10, verdict: 'keep' });
  });
  it('marks hidden games and keeps non-game screens apart', () => {
    const r = base({ hidden: ['c'], screens: [{ screen: 'shop', opens: 9, players: 5, cameBack: 2, minutes: 18, prevOpens: 0 }, { screen: 'home', opens: 99, players: 20, cameBack: 20, minutes: 99, prevOpens: 0 }, { screen: 'game:a', opens: 1, players: 1, cameBack: 0, minutes: 1, prevOpens: 0 }] });
    expect(gameRows(r, GAMES).find((x) => x.id === 'c')?.hidden).toBe(true);
    expect(featureRows(r).map((x) => x.id)).toEqual(['shop']);
  });
  it('reads hours', () => {
    expect(hourLabel(0)).toBe('12 am');
    expect(hourLabel(16)).toBe('4 pm');
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, minutes: hour === 16 ? 50 : hour === 19 ? 40 : hour === 7 ? 5 : 0 }));
    expect(peakHours(base({ hours }), 2)).toBe('4 pm, 7 pm');
    expect(peakHours(base())).toBe('');
  });
});
