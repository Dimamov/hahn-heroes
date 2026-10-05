import { describe, expect, it } from 'vitest';
import { BEAT_MS, RIVALS, ballPos, beatOffset, danceJudge, fetchHit, hidingSpots, isRaceDay, nextTreat, racePlace, raceProgress, rivalProgress } from './nexling-games.ts';

describe('nexling games', () => {
  it('races only on weekends', () => {
    expect(isRaceDay(new Date('2026-10-10T12:00:00'))).toBe(true); // Saturday
    expect(isRaceDay(new Date('2026-10-11T12:00:00'))).toBe(true); // Sunday
    expect(isRaceDay(new Date('2026-10-07T12:00:00'))).toBe(false); // Wednesday
  });

  it('never hides in the same spot twice in a row', () => {
    for (let n = 0; n < 50; n++) {
      const spots = hidingSpots(8, 6);
      expect(spots).toHaveLength(8);
      spots.forEach((s, i) => { expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThan(6); if (i) expect(s).not.toBe(spots[i - 1]); });
    }
    expect(hidingSpots(3, 2, () => 0)).toEqual([0, 1, 0]);
  });

  it('serves loved and unloved treats', () => {
    expect(nextTreat(() => 0).good).toBe(true);
    expect(nextTreat(() => 0.99).good).toBe(false);
  });

  it('ranks the hero against steady rivals', () => {
    expect(raceProgress(100)).toBe(100);
    expect(rivalProgress(8.5, 20)).toBe(100);
    expect(racePlace(100, 5)).toBe(1);
    expect(racePlace(0, 5)).toBe(1 + RIVALS.length);
    expect(racePlace(30, 5)).toBe(1 + RIVALS.filter((r) => r.pace * 5 > 30).length);
  });
});

describe('pet park', () => {
  it('judges dance taps by distance from the beat', () => {
    expect(danceJudge(beatOffset(BEAT_MS * 3 + 50))).toBe('perfect');
    expect(danceJudge(beatOffset(BEAT_MS * 3 - 200))).toBe('good');
    expect(danceJudge(beatOffset(BEAT_MS * 3 + 300))).toBe('miss');
  });
  it('swings the ball and checks the middle zone', () => {
    expect(ballPos(0)).toBe(0);
    expect(ballPos(700)).toBeCloseTo(1);
    expect(ballPos(1400)).toBeCloseTo(0);
    expect(fetchHit(0.5)).toBe(true);
    expect(fetchHit(0.1)).toBe(false);
  });
});
