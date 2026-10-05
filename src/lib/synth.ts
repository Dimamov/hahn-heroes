// Plays a parsed song with the Web Audio API: a bright lead, a bass line and a soft beat. No audio files.
import type { ParsedSong } from './songs.ts';

let ctx: AudioContext | null = null;

/** Call from a tap (the song button) so phones allow sound. Returns null if there is no audio. */
export function unlockAudio(): AudioContext | null {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Schedules the whole song starting `lead` seconds from now. Returns a stop function. */
export function playSong(song: ParsedSong, lead: number, volume = 1): () => void {
  const c = ctx;
  if (!c) return () => undefined;
  const master = c.createGain();
  master.gain.value = 0.9 * volume;
  master.connect(c.destination);
  const spb = 60 / song.def.bpm;
  const t0 = c.currentTime + lead;
  const nodes: AudioScheduledSourceNode[] = [];

  const tone = (type: OscillatorType, freq: number, start: number, dur: number, vol: number, bright = false) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.012);
    g.gain.setValueAtTime(vol * 0.8, start + Math.max(0.02, dur * 0.7));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur + 0.06);
    if (bright) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 3200;
      o.connect(f).connect(g);
    } else o.connect(g);
    g.connect(master);
    o.start(start); o.stop(start + dur + 0.1);
    nodes.push(o);
  };
  const noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.05), c.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const hat = (start: number, vol: number) => {
    const s = c.createBufferSource();
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 6000;
    s.buffer = noise;
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
    s.connect(f).connect(g).connect(master);
    s.start(start);
    nodes.push(s);
  };
  const kick = (start: number) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(140, start);
    o.frequency.exponentialRampToValueAtTime(45, start + 0.12);
    g.gain.setValueAtTime(0.22, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
    o.connect(g).connect(master);
    o.start(start); o.stop(start + 0.2);
    nodes.push(o);
  };

  for (let r = 0; r < song.def.repeat; r++) {
    const base = r * song.totalBeats;
    for (const e of song.events) tone('triangle', hz(e.midi), t0 + (base + e.beat) * spb, e.beats * spb * 0.92, 0.2, true);
    for (let bar = 0; bar < song.bars; bar++) {
      const root = song.roots[bar];
      for (let b = 0; b < song.def.beatsPerBar; b++) {
        const t = t0 + (base + bar * song.def.beatsPerBar + b) * spb;
        hat(t, b === 0 ? 0.05 : 0.03);
        if (b === 0) { kick(t); tone('sine', hz(root), t, spb * 1.6, 0.2); }
        else if (song.def.beatsPerBar === 4 && b === 2) { kick(t); tone('sine', hz(root + 7), t, spb * 1.6, 0.16); }
      }
    }
  }
  return () => {
    const t = c.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0.0001, t + 0.08);
    window.setTimeout(() => { nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }); master.disconnect(); }, 150);
  };
}

/** A short click for a tap; quiet so it does not fight the song. */
export function tapClick(lane: number) {
  const c = ctx;
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'square';
  o.frequency.value = [330, 440, 550][lane] ?? 440;
  g.gain.setValueAtTime(0.04, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.06);
  o.connect(g).connect(c.destination);
  o.start(); o.stop(c.currentTime + 0.08);
}
