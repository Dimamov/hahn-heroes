import { useEffect, useMemo, useState } from 'react';
import { GameFrame, WinPanel } from './GameFrame.tsx';
import { beep } from '../lib/sound.ts';

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

  useEffect(() => { setOpen([]); setDone(new Set()); setMoves(0); setLock(false); }, [round]);

  const flip = (i: number) => {
    if (lock || open.includes(i) || done.has(i)) return;
    const now = [...open, i];
    setOpen(now);
    beep(520, 90, 'triangle');
    if (now.length < 2) return;
    setMoves((m) => m + 1);
    const [a, b] = now;
    if (cards[a].f === cards[b].f) {
      beep(780, 200, 'triangle');
      setDone((d) => new Set([...d, a, b]));
      setOpen([]);
    } else {
      setLock(true);
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
            <button key={c.id} className={`mem-card${up ? ' up' : ''}${done.has(i) ? ' matched' : ''}`} onClick={() => flip(i)} aria-label={up ? c.f : 'Hidden card'}>
              <span>{up ? c.f : '✦'}</span>
            </button>
          );
        })}
      </div>
      <p className="note">Moves: {moves}</p>
    </GameFrame>
  );
}
