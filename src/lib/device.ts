/** Classroom mode is built for school Chromebooks only. `?chromebook=1` (remembered) lets staff preview it on another laptop. */
export function isChromebook(): boolean {
  try {
    if (/\bCrOS\b/.test(navigator.userAgent)) return true;
    const q = new URLSearchParams(window.location.search).get('chromebook');
    if (q === '1') localStorage.setItem('hahn-chromebook', '1');
    if (q === '0') localStorage.removeItem('hahn-chromebook');
    return localStorage.getItem('hahn-chromebook') === '1';
  } catch { return false; }
}
