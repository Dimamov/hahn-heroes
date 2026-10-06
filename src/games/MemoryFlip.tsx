import { useEffect, useMemo, useRef, useState } from 'react';
import { GameFrame, WinPanel } from './GameFrame.tsx';
import { beep } from '../lib/sound.ts';
import { burst, centerOf, popup, shake } from '../lib/fx.ts';

// Emoji stand in for the Nexus card art until it arrives.
const FACES = ['⚡', '🔮', '🐺', '📖', '🏫', '🗝️'];
const deal = () => [...FACES, ...FACES].map((f, i) => ({ f, id: i })).sort(() => Math.random() - 0.5);

export function MemoryFlip() {
  const [round, setRound] = useState(0);
  const cards = useMemo(() => { void round; return deal(); }, [round]);
  const [open, setOpen] = useState<number[]>([]);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const [lock, setLock] = useState(false);
  const [combo, setCombo] = useState(0);
  const els = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => { setOpen([]); setDone(new Set()); setMoves(0); setLock(false); setCombo(0); }, [round]);

  const flip = (i: number) => {
    if (lock || open.includes(i) || done.has(i)) return;
    const now = [...open, i];
    setOpen(now);
    beep(520, 90, 'triangle');
    if (now.length < 2) return;
    setMoves((m) => m + 1);
    const [a, b] = now;
    if (cards[a].f === cards[b].f) {
      beep(780 + combo * 60, 200, 'triangle');
      const ca = centerOf(els.current[a]), cb = centerOf(els.current[b]);
      burst(ca.x, ca.y, '#fbbf24', 10); burst(cb.x, cb.y, '#22d3ee', 10);
      popup((ca.x + cb.x) / 2, (ca.y + cb.y) / 2, combo >= 1 ? `COMBO x${combo + 1}!` : 'Match!', '#fbbf24', combo >= 1);
      setCombo((n) => n + 1);
      setDone((d) => new Set([...d, a, b]));
      setOpen([]);
    } else {
      setLock(true); setCombo(0); shake(els.current[a]?.parentElement, 4);
      setTimeout(() => { setOpen([]); setLock(false); }, 800);
    }
  };

  if (done.size === cards.length) return <GameFrame title="Memory Flip"><WinPanel game="memory-flip" message={`All pairs found in ${moves} moves!`} onAgain={() => setRound((r) => r + 1)} /></GameFrame>;
  return (
    <GameFrame title="Memory Flip" hint="Flip two cards. Match all the pairs!">
      <div className="memory-board">
        {cards.map((c, i) => {
          const up = open.includes(i) || done.has(i);
          return (
            <button key={c.id} ref={(el) => { els.current[i] = el; }} className={`mem-card${up ? ' up' : ''}${done.has(i) ? ' matched' : ''}`} onClick={() => flip(i)} aria-label={up ? c.f : 'Hidden card'}>
              <span className="mem-inner"><span className="mem-back">✦</span><span className="mem-front">{c.f}</span></span>
            </button>
          );
        })}
      </div>
      <p className="note pill">Moves: {moves}{combo >= 2 ? ` · 🔥 x${combo}` : ''}</p>
    </GameFrame>
  );
}
