// Weather and time themes: the app's backdrop shifts with the time of day and the season.
export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night';
export type Season = 'autumn' | 'winter' | 'spring' | 'summer';
export const timeOfDay = (d: Date): TimeOfDay => { const h = d.getHours(); return h >= 5 && h < 10 ? 'morning' : h >= 10 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'evening' : 'night'; };
/** Northern-hemisphere seasons by month. */
export const seasonOf = (d: Date): Season => { const m = d.getMonth(); return m >= 8 && m <= 10 ? 'autumn' : m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : 'summer'; };
export const SEASON_ICON: Record<Season, string> = { autumn: '🍂', winter: '❄️', spring: '🌸', summer: '☀️' };

/** Put the current theme on the page so the CSS can tint the backdrop. */
export function applyTheme(el: HTMLElement = document.documentElement, d: Date = new Date()) {
  el.dataset.time = timeOfDay(d);
  el.dataset.season = seasonOf(d);
}
