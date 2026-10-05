import { useCallback, useEffect, useRef, useState } from 'react';
import { GameFrame } from './GameFrame.tsx';
import { useSession } from '../App.tsx';
import { KITS, LOOP_MS, PADS_PER_KIT, cleanLoop, newHits, padInfo, padNumber, type LoopHit } from '../lib/jam.ts';
import { playPad } from '../lib/pads.ts';
import type { JamFeed } from '../lib/backend.ts';

/** Soundboard and squad jam: tap synthesized pads, record an 8 second loop, and hear squad mates playing live. */
export function JamSession() {
  const { backend } = useSession();
  const [kit, setKit] = useState(0);
  const [lit, setLit] = useState<number | null>(null);
  const [mode, setMode] = useState<'idle' | 'rec' | 'loop'>('idle');
  const [loop, setLoop] = useState<LoopHit[]>([]);
  const [feed, setFeed] = useState<JamFeed>({ squad: null, mates: [] });
  const [pulse, setPulse] = useState<Record<string, number>>({});
  const outbox = useRef<number[]>([]);
  const seen = useRef<Record<string, number>>({});
  const recStart = useRef(0);
  const rec = useRef<LoopHit[]>([]);
  const timers = useRef<number[]>([]);
  const clearTimers = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };

  const stopRec = useCallback(() => {
    const hits = cleanLoop(rec.current);
    setLoop(hits);
    setMode(hits.length ? 'loop' : 'idle');
  }, []);

  const tap = (pad: number) => {
    playPad(pad);
    setLit(pad);
    window.setTimeout(() => setLit((l) => (l === pad ? null : l)), 120);
    outbox.current.push(pad);
    if (mode === 'rec') rec.current.push({ t: Date.now() - recStart.current, pad });
  };

  const toggleRec = () => {
    clearTimers();
    if (mode === 'rec') { stopRec(); return; }
    rec.current = []; recStart.current = Date.now(); setMode('rec');
    timers.current.push(window.setTimeout(stopRec, LOOP_MS));
  };

  // Loop playback: every cycle schedules each recorded hit.
  useEffect(() => {
    if (mode !== 'loop' || !loop.length) return;
    const len = Math.max(1000, loop[loop.length - 1].t + 400);
    const run = () => {
      for (const h of loop) timers.current.push(window.setTimeout(() => { playPad(h.pad, 0.8); setLit(h.pad); window.setTimeout(() => setLit((l) => (l === h.pad ? null : l)), 100); }, h.t));
      timers.current.push(window.setTimeout(run, len));
    };
    run();
    return clearTimers;
  }, [mode, loop]);

  // Squad: send my hits, read mates' hits once a second.
  useEffect(() => {
    let alive = true;
    const send = window.setInterval(() => {
      if (!outbox.current.length) return;
      const pads = outbox.current.splice(0).slice(-8);
      backend.jamHit(pads).catch(() => undefined);
    }, 600);
    const poll = async () => {
      try {
        const f = await backend.jamFeed();
        if (!alive) return;
        setFeed(f);
        for (const { mate, pads } of newHits(seen.current, f.mates)) {
          pads.forEach((p, i) => window.setTimeout(() => playPad(p, 0.7), i * 110));
          setPulse((x) => ({ ...x, [mate.id]: Date.now() }));
        }
      } catch { /* offline: keep jamming alone */ }
    };
    void poll();
    const t = window.setInterval(poll, 1000);
    return () => { alive = false; window.clearInterval(send); window.clearInterval(t); clearTimers(); };
  }, [backend]);

  const [now, setNow] = useState(0);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(t); }, []);

  const live = feed.mates.filter((m) => m.live);
  return (
    <GameFrame title="Jam Session">
      <div className="chips jam-kits">
        {KITS.map((k, i) => <button key={k.id} className={`chip${kit === i ? ' chosen' : ''}`} onClick={() => setKit(i)}>{k.icon} {k.label}</button>)}
      </div>
      <div className="jam-pads">
        {Array.from({ length: PADS_PER_KIT }, (_, i) => {
          const n = padNumber(kit, i);
          const info = padInfo(n);
          return (
            <button key={n} className={`jam-pad k${kit}${lit === n ? ' lit' : ''}`} onPointerDown={(e) => { e.preventDefault(); tap(n); }} aria-label={info.label}>
              <span aria-hidden>{info.icon}</span><small>{info.label}</small>
            </button>
          );
        })}
      </div>
      <div className="jam-bar">
        <button className={`btn ${mode === 'rec' ? 'primary' : 'ghost'}`} onClick={toggleRec}>{mode === 'rec' ? '⏹ Stop' : '⏺ Record loop'}</button>
        {mode === 'loop' && <button className="btn ghost" onClick={() => { clearTimers(); setMode('idle'); setLoop([]); }}>Clear loop</button>}
      </div>
      <p className="note jam-note" role="status">
        {mode === 'rec' ? 'Recording... tap your pads (up to 8 seconds).' : mode === 'loop' ? '🔁 Your loop is playing. Add more pads on top!'
          : !feed.squad ? 'Playing solo. Join a squad to jam with friends.'
          : live.length ? live.map((m) => `${m.name}${now - (pulse[m.id] ?? 0) < 1500 ? ' 🎶' : ''}`).join(', ') + (live.length === 1 ? ' is jamming!' : ' are jamming!')
          : `${feed.squad} jam: nobody else is here yet. Their sounds play on your phone when they tap.`}
      </p>
    </GameFrame>
  );
}
