import { useMemo, useRef, useState } from 'react';
import { GameFrame, WinPanel } from './GameFrame.tsx';
import { beep } from '../lib/sound.ts';
import { burst, centerOf, flashEdge, popup, shake } from '../lib/fx.ts';
import { ROUNDS, WIN_AT, checkOrder, pickRounds, scramble, swap, type RiftSet } from '../lib/chrono.ts';

interface Round { set: RiftSet; order: number[] }
const newGame = (): Round[] => pickRounds().map((set) => ({ set, order: scramble(set.steps.length) }));

/** A time rift scrambled some events. Tap one card, then another, to swap them until the order is right. */
export function ChronoRift() {
  const [rounds, setRounds] = useState<Round[]>(newGame);
  const [i, setI] = useState(0);
  const [order, setOrder] = useState<number[]>(() => rounds[0].order);
  const [pick, setPick] = useState<number | null>(null);
  const [tries, setTries] = useState(0);
  const [marks, setMarks] = useState<boolean[] | null>(null); // after a check: which positions are right
  const [done, setDone] = useState<null | 'won' | 'lost'>(null);
  const [correct, setCorrect] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'play' | 'over'>('ready');
  const set = rounds[i].set;
  const finished = marks?.every(Boolean) || tries >= 2; // this round is settled: either solved or out of tries
  const locked = useMemo(() => (marks && !finished ? marks : []), [marks, finished]);

  const start = () => { const g = newGame(); setRounds(g); setI(0); setOrder(g[0].order); setPick(null); setTries(0); setMarks(null); setCorrect(0); setDone(null); setPhase('play'); };
  const tap = (pos: number) => {
    if (finished) return;
    if (pick === null) { if (!locked[pos]) setPick(pos); return; }
    setOrder((o) => swap(o, pick, pos, locked));
    setPick(null);
    beep(440, 60, 'triangle');
  };
  // Drag a card onto another to swap them (tapping two cards still works too).
  const drag = useRef<{ pos: number; x: number; y: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState<{ pos: number; dx: number; dy: number } | null>(null);
  const justDragged = useRef(false);
  const onDown = (pos: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (finished || locked[pos]) return;
    drag.current = { pos, x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 10) return;
    d.moved = true;
    setPick(null);
    setDragging({ pos: d.pos, dx, dy });
  };
  const onUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) return; // a plain tap: the click handler takes it from here
    justDragged.current = true;
    window.setTimeout(() => { justDragged.current = false; }, 0);
    setDragging(null);
    const under = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el instanceof HTMLElement && el.dataset.pos !== undefined && Number(el.dataset.pos) !== d.pos) as HTMLElement | undefined;
    if (under) { setOrder((o) => swap(o, d.pos, Number(under.dataset.pos), locked)); beep(440, 60, 'triangle'); }
  };
  const check = () => {
    const m = checkOrder(order);
    setMarks(m); setTries((t) => t + 1); setPick(null);
    const ok = m.every(Boolean);
    beep(ok ? 784 : 220, 140, 'triangle');
    if (ok) { setCorrect((c) => c + 1); const c = centerOf(document.querySelector('.rift-list')); burst(c.x, c.y, '#22d3ee', 24, 130); popup(c.x, c.y, 'TIMELINE FIXED!', '#fbbf24', true); }
    else { shake(document.querySelector('.rift-list'), 5); if (tries >= 1) flashEdge(); }
  };
  const next = () => {
    if (i + 1 >= ROUNDS) { setDone(correct >= WIN_AT ? 'won' : 'lost'); setPhase('over'); return; }
    setI(i + 1); setOrder(rounds[i + 1].order); setPick(null); setTries(0); setMarks(null);
  };

  if (phase === 'over' && done === 'won') return <GameFrame title="Chrono-Rift"><WinPanel game="chrono-rift" message={`${correct} of ${ROUNDS} timelines fixed!`} onAgain={start} /></GameFrame>;
  if (phase === 'over') {
    return (
      <GameFrame title="Chrono-Rift">
        <div className="grow" />
        <div className="soon-icon" aria-hidden>🌀</div>
        <h3>{correct} of {ROUNDS} timelines fixed</h3>
        <p className="hint">Fix {WIN_AT} to win the daily reward. New puzzles every time!</p>
        <div className="grow" />
        <button className="btn primary" onClick={start}>Play again</button>
      </GameFrame>
    );
  }
  if (phase === 'ready') {
    return (
      <GameFrame title="Chrono-Rift" hint={`A time rift scrambled ${ROUNDS} timelines from science and history. Put each one back in order. Fix ${WIN_AT} to win.`}>
        <div className="grow" /><div className="soon-icon" aria-hidden>🌀</div><div className="grow" />
        <button className="btn primary" onClick={start}>Enter the rift</button>
      </GameFrame>
    );
  }
  const shown = finished && !marks?.every(Boolean) ? set.steps.map((_, k) => k) : order; // out of tries: show the right order
  return (
    <GameFrame title="Chrono-Rift">
      <p className="note">🌀 {i + 1}/{ROUNDS} · {set.title}</p>
      <p className="hint">{finished ? (marks?.every(Boolean) ? '✅ Timeline fixed!' : 'Here is the right order.') : tries === 1 ? 'Close! The ✅ ones are locked. Swap the rest.' : 'Drag a card onto another to swap them (or tap two cards). First event on top.'}</p>
      <div className="rift-list">
        {shown.map((step, pos) => {
          const s = set.steps[step];
          const mark = marks ? (finished && !marks.every(Boolean) ? true : marks[pos]) : null;
          return (
            <button key={step} className={`rift-card${pick === pos ? ' pick' : ''}${mark === true ? ' ok' : mark === false ? ' bad' : ''}`} data-pos={pos} style={dragging?.pos === pos ? { transform: `translate(${dragging.dx}px, ${dragging.dy}px)`, zIndex: 5, opacity: 0.9 } : undefined} onPointerDown={onDown(pos)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { drag.current = null; setDragging(null); }} onClick={() => { if (!justDragged.current) tap(pos); }} aria-label={`Position ${pos + 1}: ${s.text}`}>
              <b>{pos + 1}</b><span>{s.text}</span>{finished && s.when && <em>{s.when}</em>}{mark !== null && <i aria-hidden>{mark ? '✅' : '❌'}</i>}
            </button>
          );
        })}
      </div>
      <div className="grow" />
      {!finished && <button className="btn primary" onClick={check}>Check the order</button>}
      {finished && <button className="btn primary" onClick={next}>{i + 1 >= ROUNDS ? 'See my score' : 'Next timeline'}</button>}
    </GameFrame>
  );
}
