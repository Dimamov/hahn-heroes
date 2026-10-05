// Jam Session: pad layout and the small pure rules around it. Sounds are synthesized in pads.ts.

export interface PadInfo { kit: number; index: number; label: string; icon: string }
export const KITS = [
  { id: 'drums', label: 'Drums', icon: '🥁', pads: ['Kick', 'Snare', 'Hat', 'Clap', 'High tom', 'Low tom', 'Cowbell', 'Crash'] },
  { id: 'synth', label: 'Synth', icon: '🎹', pads: ['C', 'D', 'E', 'G', 'A', 'high C', 'high D', 'high E'] },
  { id: 'zap', label: 'Zap', icon: '⚡', pads: ['Laser', 'Bloop', 'Boing', 'Sparkle', 'Siren', 'Whoosh', 'Pop', 'Power up'] },
] as const;
export const PADS_PER_KIT = 8;
export const PAD_COUNT = KITS.length * PADS_PER_KIT;
/** Longest loop a hero can record. */
export const LOOP_MS = 8000;

const PAD_ICONS = [
  ['🦶', '🪘', '🎩', '👏', '🔴', '🔵', '🔔', '💥'],
  ['🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '🩷', '🤍'],
  ['🔫', '🫧', '🦘', '✨', '🚨', '💨', '🎈', '🚀'],
];

export function padInfo(n: number): PadInfo {
  const kit = Math.floor(n / PADS_PER_KIT);
  const index = n % PADS_PER_KIT;
  return { kit, index, label: KITS[kit].pads[index], icon: PAD_ICONS[kit][index] };
}
export const padNumber = (kit: number, index: number) => kit * PADS_PER_KIT + index;
export const validPad = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < PAD_COUNT;

/** Major pentatonic from middle C: every note sounds good with every other. */
export const SYNTH_MIDI = [60, 62, 64, 67, 69, 72, 74, 76];
export const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export interface LoopHit { t: number; pad: number }

/** Keeps only hits inside the loop length, in time order. */
export function cleanLoop(hits: LoopHit[]): LoopHit[] {
  return hits.filter((h) => h.t >= 0 && h.t < LOOP_MS && validPad(h.pad)).sort((a, b) => a.t - b.t);
}

export interface Mate { id: string; name: string; seq: number; pads: number[]; live: boolean }

/** Which pads to play for each mate since the last poll. The first sighting of a mate plays nothing (it is old news). */
export function newHits(seen: Record<string, number>, mates: Mate[]): { mate: Mate; pads: number[] }[] {
  const out: { mate: Mate; pads: number[] }[] = [];
  for (const m of mates) {
    const before = seen[m.id];
    seen[m.id] = m.seq;
    if (before === undefined || m.seq <= before) continue;
    const pads = m.pads.slice(-Math.min(m.seq - before, m.pads.length)).filter(validPad);
    if (pads.length) out.push({ mate: m, pads });
  }
  return out;
}
