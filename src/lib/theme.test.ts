import { describe, expect, it } from 'vitest';
import { applyTheme, seasonOf, timeOfDay } from './theme.ts';

describe('time and season themes', () => {
  it('maps hours to the four times of day', () => {
    expect([6, 12, 18, 22, 2].map((h) => timeOfDay(new Date(2026, 9, 5, h)))).toEqual(['morning', 'day', 'evening', 'night', 'night']);
  });
  it('maps months to seasons', () => {
    expect([9, 0, 3, 7].map((m) => seasonOf(new Date(2026, m, 15)))).toEqual(['autumn', 'winter', 'spring', 'summer']);
  });
  it('sets both on the element', () => {
    const el = document.createElement('div');
    applyTheme(el, new Date(2026, 9, 5, 21));
    expect(el.dataset.time).toBe('night');
    expect(el.dataset.season).toBe('autumn');
  });
});
