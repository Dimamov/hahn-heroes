import { useRef, useState } from 'react';
import { GameFrame, WinPanel } from './GameFrame.tsx';
import { beep } from '../lib/sound.ts';
import { burst, popup, shake } from '../lib/fx.ts';
import { COLS, newGame, shoot, DROP_AFTER } from '../lib/bubble.ts';

// Each color also has its own shape, so the game works without telling colors apart.
const LOOK = [
  { c: '#38bdf8', s: '●' }, { c: '#f472b6', s: '▲' }, { c: '#facc15', s: '■' }, { c: '#4ade80', s: '◆' },
];
const Bub = ({ v, small }: { v: number | null; small?: boolean }) => (
  <i className={`bub${v === null ? ' none' : ''}${small ? ' small' : ''}`} style={v === null ? undefined : { background: LOOK[v].c }} aria-hidden>{v === null ? '' : LOOK[v].s}</i>
);

/** Tap a column to fire a bubble up it. Match 3 or more to pop them. Clear the board to win. */
export function BubblePop() {
  const [g, setG] = useState(() => newGame(Math.random));
  const board = useRef<HTMLDivElement>(null);
  const fire = (col: number) => {
    const next = shoot(g, col, Math.random);
    const got = next.popped - g.popped;
    beep(got ? 700 : 330, 80, 'triangle');
    const r = board.current?.getBoundingClientRect();
    if (r) {
      const x = r.left + ((col + 0.5) / COLS) * r.width;
      if (got) { burst(x, r.top + r.height * 0.45, LOOK[g.shooter].c, Math.min(26, 8 + got * 3), 90); popup(x, r.top + r.height * 0.4, got >= 5 ? `BIG POP! +${got}` : `+${got}`, '#fff', got >= 5); if (got >= 5) shake(board.current, 5); }
      else burst(x, r.bottom - 8, '#94a3b8', 4, 30);
    }
    setG(next);
  };
  if (g.over === 'win') return <GameFrame title="Bubble Pop"><WinPanel game="bubble-pop" message="You cleared the board!" onAgain={() => setG(newGame(Math.random))} /></GameFrame>;
  if (g.over === 'lose') {
    return (
      <GameFrame title="Bubble Pop">
        <div className="grow" />
        <div className="soon-icon" aria-hidden>🫧</div>
        <h3>The bubbles reached the bottom</h3>
        <p className="hint">You popped {g.popped}. Clear the whole board to win the daily reward.</p>
        <div className="grow" />
        <button className="btn primary" onClick={() => setG(newGame(Math.random))}>Try again</button>
      </GameFrame>
    );
  }
  return (
    <GameFrame title="Bubble Pop" hint="Tap a column to fire up it. Match 3 or more touching bubbles to pop them.">
      <div className="bub-board" ref={board} style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
        {Array.from({ length: COLS }, (_, c) => (
          <button key={c} className="bub-col" onClick={() => fire(c)} aria-label={`Fire up column ${c + 1}`}>
            {g.grid.map((row, r) => <Bub key={r} v={row[c]} />)}
          </button>
        ))}
      </div>
      <div className="bub-shooter"><Bub v={g.shooter} /><small>next</small><Bub v={g.next} small /><small className="grow-r">New row in {DROP_AFTER - g.misses}</small></div>
    </GameFrame>
  );
}
