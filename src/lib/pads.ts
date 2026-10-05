// Plays one jam pad with the Web Audio API. Every sound is generated here from oscillators and noise.
import { unlockAudio } from './synth.ts';
import { SYNTH_MIDI, midiHz, padInfo } from './jam.ts';

let noiseBuf: AudioBuffer | null = null;

export function playPad(n: number, volume = 1): void {
  const c = unlockAudio();
  if (!c) return;
  const { kit, index } = padInfo(n);
  const t = c.currentTime + 0.005;
  const out = c.createGain();
  out.gain.value = 0.7 * volume;
  out.connect(c.destination);
  noiseBuf ??= (() => {
    const b = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  })();

  const osc = (type: OscillatorType, f0: number, f1: number, dur: number, vol: number, start = t) => {
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, start);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(out);
    o.start(start); o.stop(start + dur + 0.05);
  };
  const hiss = (hp: number, dur: number, vol: number, start = t, lp = 0) => {
    const s = c.createBufferSource(); const g = c.createGain(); const f = c.createBiquadFilter();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    s.connect(f);
    if (lp) { const l = c.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp; f.connect(l).connect(g); } else f.connect(g);
    g.connect(out);
    s.start(start); s.stop(start + dur + 0.05);
  };

  if (kit === 0) {
    switch (index) {
      case 0: osc('sine', 150, 45, 0.28, 1); break;
      case 1: osc('triangle', 220, 120, 0.12, 0.5); hiss(1500, 0.16, 0.6); break;
      case 2: hiss(7000, 0.05, 0.5); break;
      case 3: for (const d of [0, 0.012, 0.024]) hiss(1200, 0.06, 0.5, t + d, 4000); hiss(1200, 0.18, 0.4, t + 0.036, 4000); break;
      case 4: osc('sine', 260, 140, 0.25, 0.9); break;
      case 5: osc('sine', 160, 80, 0.32, 1); break;
      case 6: osc('square', 560, 560, 0.2, 0.25); osc('square', 845, 845, 0.2, 0.25); break;
      default: hiss(4000, 0.9, 0.5);
    }
  } else if (kit === 1) {
    const f = midiHz(SYNTH_MIDI[index]);
    osc('triangle', f, f, 0.55, 0.7);
    osc('sine', f * 2, f * 2, 0.4, 0.2);
  } else {
    switch (index) {
      case 0: osc('sawtooth', 1800, 200, 0.22, 0.4); break;
      case 1: osc('sine', 300, 900, 0.14, 0.8); break;
      case 2: osc('triangle', 150, 600, 0.35, 0.8); osc('triangle', 600, 200, 0.25, 0.5, t + 0.2); break;
      case 3: for (let i = 0; i < 5; i++) osc('sine', 1400 + i * 350, 1400 + i * 350, 0.14, 0.3, t + i * 0.05); break;
      case 4: osc('square', 600, 900, 0.3, 0.25); osc('square', 900, 600, 0.3, 0.25, t + 0.3); break;
      case 5: hiss(800, 0.5, 0.5, t, 3000); break;
      case 6: osc('sine', 900, 200, 0.08, 1); break;
      default: [0, 4, 7, 12].forEach((s, i) => osc('square', midiHz(60 + s), midiHz(60 + s), 0.14, 0.3, t + i * 0.07));
    }
  }
}
