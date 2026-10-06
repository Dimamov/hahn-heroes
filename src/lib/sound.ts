// Tiny sound helpers built on the Web Audio API. Everything is optional: if audio is blocked
// or missing, the game just plays quietly.
let ctx: AudioContext | null = null;
const audio = (): AudioContext | null => {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
};

let quiet = false;
/** Quiet mode: no sounds and no flashy effects, for when the room needs to settle. */
export const isQuiet = () => quiet;
export const setQuiet = (on: boolean) => { quiet = on; };

export function beep(freq: number, ms = 250, type: OscillatorType = 'sine', volume = 0.15) {
  if (quiet) return;
  const c = audio();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + ms / 1000);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + ms / 1000);
}

/** A rising and falling siren. Returns how long it lasts so the caller can block repeats. */
export function siren(seconds = 3): number {
  if (quiet) return 0;
  const c = audio();
  if (!c) return 0;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sawtooth';
  gain.gain.value = 0.08;
  const t0 = c.currentTime;
  for (let t = 0; t < seconds; t += 1) {
    osc.frequency.linearRampToValueAtTime(900, t0 + t + 0.5);
    osc.frequency.linearRampToValueAtTime(500, t0 + t + 1);
  }
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + seconds);
  return seconds * 1000;
}
