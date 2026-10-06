import { useCallback, useEffect, useRef, useState } from 'react';
import { GameFrame, WinPanel } from './GameFrame.tsx';
import { beep } from '../lib/sound.ts';
import { burst, centerOf, flashEdge, popup, shake } from '../lib/fx.ts';

const PADS = ['#ff3fa4', '#22d3ee', '#fbbf24', '#8b5cff'];
const TONES = [330, 440, 550, 660];
const GOAL = 7;

export function PatternPulse() {
  const [seq, setSeq] = useState<number[]>([]);
  const [phase, setPhase] = useState<'ready' | 'show' | 'input' | 'lost' | 'won'>('ready');
  const [lit, setLit] = useState<number | null>(null);
  const [at, setAt] = useState(0);
  const timers = useRef<number[]>([]);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clear, []);

  const pads = useRef<(HTMLButtonElement | null)[]>([]);
  const flash = useCallback((pad: number) => { setLit(pad); beep(TONES[pad], 260, 'triangle'); timers.current.push(window.setTimeout(() => setLit(null), 320)); }, []);

  const play = useCallback((s: number[]) => {
    clear();
    setPhase('show'); setAt(0);
    s.forEach((pad, i) => timers.current.push(window.setTimeout(() => flash(pad), 700 + i * 650)));
    timers.current.push(window.setTimeout(() => setPhase('input'), 700 + s.length * 650));
  }, [flash]);

  const start = () => { const s = [Math.floor(Math.random() * 4), Math.floor(Math.random() * 4), Math.floor(Math.random() * 4)]; setSeq(s); play(s); };

  const tap = (pad: number) => {
    if (phase !== 'input') return;
    flash(pad);
    const c = centerOf(pads.current[pad]);
    if (pad !== seq[at]) { setPhase('lost'); beep(120, 400, 'sawtooth'); shake(); flashEdge(); popup(c.x, c.y, 'Oops!', '#ff5c7a', true); return; }
    burst(c.x, c.y, PADS[pad], 10);
    if (at + 1 < seq.length) { setAt(at + 1); return; }
    popup(c.x, c.y, seq.length >= GOAL ? 'PERFECT!' : `Round ${Math.max(1, seq.length - 2)} clear!`, '#fbbf24', true);
    if (seq.length >= GOAL) { setPhase('won'); return; }
    const next = [...seq, Math.floor(Math.random() * 4)];
    setSeq(next);
    timers.current.push(window.setTimeout(() => play(next), 600));
  };

  if (phase === 'won') return <GameFrame title="Pattern Pulse"><WinPanel game="pattern-pulse" message={`Perfect memory! You repeated ${GOAL} lights.`} onAgain={start} /></GameFrame>;
  return (
    <GameFrame title="Pattern Pulse" hint={phase === 'ready' ? `Watch the lights, then copy them. Reach ${GOAL} to win!` : phase === 'show' ? 'Watch...' : phase === 'input' ? 'Your turn!' : 'Oops! That was the wrong pad.'}>
      <div className="pulse-pads" aria-label="Light pads">
        {PADS.map((c, i) => (
          <button key={i} ref={(el) => { pads.current[i] = el; }} className={`pulse-pad${lit === i ? ' lit' : ''}`} style={{ ['--pad' as string]: c }} onClick={() => tap(i)} aria-label={`Pad ${i + 1}`} />
        ))}
      </div>
      <p className="note pill">{phase === 'ready' ? '' : `Round ${Math.max(1, seq.length - 2)} · ${seq.length} lights`}</p>
      {(phase === 'ready' || phase === 'lost') && <button className="btn primary" onClick={start}>{phase === 'ready' ? 'Start' : 'Try again'}</button>}
    </GameFrame>
  );
}
