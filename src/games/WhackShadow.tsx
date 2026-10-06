import { useEffect, useRef, useState } from 'react';
import { GameFrame, WinPanel } from './GameFrame.tsx';
import { beep } from '../lib/sound.ts';
import { burst, centerOf, flashEdge, popup, shake } from '../lib/fx.ts';
import { WHACK_HOLES, WHACK_SECONDS, WHACK_WIN, dwellMs, nextPop, whackScore, type Pop } from '../lib/whack.ts';

/** 30 seconds of whacking shadows. Friendly Nexlings pop up too, so look before you tap. */
export function WhackShadow() {
  const [phase, setPhase] = useState<'ready' | 'play' | 'over'>('ready');
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(WHACK_SECONDS);
  const [pop, setPop] = useState<Pop | null>(null);
  const popRef = useRef<Pop | null>(null);
  const started = useRef(0);
  const holes = useRef<(HTMLButtonElement | null)[]>([]);
  const streak = useRef(0);

  const show = (p: Pop | null) => { popRef.current = p; setPop(p); };
  const start = () => { streak.current = 0; setScore(0); setLeft(WHACK_SECONDS); started.current = Date.now(); show(nextPop(null, Math.random)); setPhase('play'); };

  useEffect(() => {
    if (phase !== 'play') return;
    const tick = window.setInterval(() => {
      const t = Math.floor((Date.now() - started.current) / 1000);
      setLeft(Math.max(0, WHACK_SECONDS - t));
      if (t >= WHACK_SECONDS) { show(null); setPhase('over'); }
    }, 200);
    return () => window.clearInterval(tick);
  }, [phase]);

  // A pop stays up for a moment, then moves on. A tap moves it on sooner.
  useEffect(() => {
    if (phase !== 'play') return;
    const id = window.setTimeout(() => show(nextPop(popRef.current, Math.random)), pop ? dwellMs((Date.now() - started.current) / 1000) : 200);
    return () => window.clearTimeout(id);
  }, [phase, pop]);

  const whack = (hole: number) => {
    const p = popRef.current;
    if (!p || p.hole !== hole) return;
    setScore((s) => whackScore(s, p.kind));
    const c = centerOf(holes.current[hole]);
    if (p.kind === 'shadow') {
      streak.current += 1;
      burst(c.x, c.y, '#c4b5fd', 14, 80);
      popup(c.x, c.y, streak.current >= 3 ? `COMBO x${streak.current}!` : '+1', streak.current >= 3 ? '#fbbf24' : '#fff', streak.current >= 3);
    } else {
      streak.current = 0;
      burst(c.x, c.y, '#ff5c7a', 8);
      popup(c.x, c.y, 'Oops! -1', '#ff5c7a', true);
      shake(); flashEdge();
    }
    beep(p.kind === 'shadow' ? 660 : 220, 90, 'triangle');
    show(null);
  };

  if (phase === 'over' && score >= WHACK_WIN) return <GameFrame title="Whack-a-Shadow"><WinPanel game="whack-shadow" message={`${score} shadows whacked!`} onAgain={start} /></GameFrame>;
  if (phase === 'over') {
    return (
      <GameFrame title="Whack-a-Shadow">
        <div className="grow" />
        <div className="soon-icon" aria-hidden>👻</div>
        <h3>{score} shadows</h3>
        <p className="hint">Get {WHACK_WIN} to win the daily reward. Try again!</p>
        <div className="grow" />
        <button className="btn primary" onClick={start}>Play again</button>
      </GameFrame>
    );
  }
  return (
    <GameFrame title="Whack-a-Shadow" hint={phase === 'ready' ? `Tap the shadows 👻 before they hide. Leave the friendly Nexlings 🐣 alone! Get ${WHACK_WIN} in ${WHACK_SECONDS} seconds.` : undefined}>
      {phase === 'play' && <p className="note pill">⏱ {left}s · 👻 {score}</p>}
      <div className="whack-board">
        {Array.from({ length: WHACK_HOLES }, (_, i) => (
          <button key={i} ref={(el) => { holes.current[i] = el; }} className="whack-hole" onPointerDown={() => phase === 'play' && whack(i)} disabled={phase !== 'play'} aria-label={pop?.hole === i ? (pop.kind === 'shadow' ? 'Shadow' : 'Friendly Nexling') : 'Empty hole'}>
            <span className={`whack-pop${pop?.hole === i ? ' up' : ''}`}>{pop?.hole === i ? (pop.kind === 'shadow' ? '👻' : '🐣') : ''}</span>
          </button>
        ))}
      </div>
      {phase === 'ready' && <button className="btn primary" onClick={start}>Start</button>}
    </GameFrame>
  );
}
