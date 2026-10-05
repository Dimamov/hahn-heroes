import { useState } from 'react';
import { GameFrame, WinPanel } from './GameFrame.tsx';
import { beep } from '../lib/sound.ts';
import { SIZE, WIN_SCORE, newGame, place, sizeOf, canPlace, type Piece } from '../lib/blocks.ts';

const COLORS = ['#38bdf8', '#f472b6', '#facc15', '#4ade80', '#a78bfa'];

function Mini({ p }: { p: Piece }) {
  const { h, w } = sizeOf(p.shape);
  return (
    <span className="blk-mini" style={{ gridTemplateColumns: `repeat(${w}, 1fr)`, gridTemplateRows: `repeat(${h}, 1fr)`, aspectRatio: `${w} / ${h}` }} aria-hidden>
      {Array.from({ length: h * w }, (_, k) => <i key={k} style={p.shape.some(([r, c]) => r * w + c === k) ? { background: COLORS[p.color] } : undefined} />)}
    </span>
  );
}

/** Pick a piece, then tap where its top-left corner goes. Full rows and columns clear. */
export function BlockBlast() {
  const [g, setG] = useState(() => newGame(Math.random));
  const [sel, setSel] = useState<number | null>(0);
  const [won, setWon] = useState(false);
  const piece = sel !== null ? g.tray[sel] : null;

  const tap = (r: number, c: number) => {
    if (!piece || sel === null) return;
    const { h, w } = sizeOf(piece.shape);
    const row = Math.min(r, SIZE - h), col = Math.min(c, SIZE - w); // keep the piece on the board
    if (!canPlace(g.board, piece.shape, row, col)) { beep(200, 80, 'sawtooth'); return; }
    const n = place(g, sel, row, col, Math.random);
    beep(n.score - g.score > piece.shape.length ? 760 : 440, 90, 'triangle');
    setG(n);
    setSel(n.tray.findIndex((t) => t !== null));
    if (n.score >= WIN_SCORE) setWon(true);
  };
  const again = () => { setG(newGame(Math.random)); setSel(0); setWon(false); };

  if (won) return <GameFrame title="Block Blast"><WinPanel game="block-blast" message={`${g.score} points!`} onAgain={again} /></GameFrame>;
  if (g.over) {
    return (
      <GameFrame title="Block Blast">
        <div className="grow" />
        <div className="soon-icon" aria-hidden>🧱</div>
        <h3>No more room</h3>
        <p className="hint">You scored {g.score}. Reach {WIN_SCORE} to win the daily reward.</p>
        <div className="grow" />
        <button className="btn primary" onClick={again}>Try again</button>
      </GameFrame>
    );
  }
  return (
    <GameFrame title="Block Blast" hint={`Pick a piece, tap the board to place it. Fill a row or column to clear it. Reach ${WIN_SCORE}!`}>
      <p className="note">Score {g.score} / {WIN_SCORE}</p>
      <div className="blk-board" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}>
        {g.board.map((row, r) => row.map((v, c) => (
          <button key={`${r}-${c}`} className="blk-cell" style={v === null ? undefined : { background: COLORS[v] }} onClick={() => tap(r, c)} aria-label={`Row ${r + 1} column ${c + 1}${v === null ? '' : ' filled'}`} />
        )))}
      </div>
      <div className="blk-tray">
        {g.tray.map((p, i) => (
          <button key={i} className={`blk-slot${sel === i ? ' chosen' : ''}`} disabled={!p} onClick={() => setSel(i)} aria-label={p ? `Piece ${i + 1}` : 'Used'}>{p && <Mini p={p} />}</button>
        ))}
      </div>
    </GameFrame>
  );
}
