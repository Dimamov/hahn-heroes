import { useState } from 'react';
import { GameFrame, WinPanel } from './GameFrame.tsx';
import { beep } from '../lib/sound.ts';
import { burst, flashEdge, popup, shake } from '../lib/fx.ts';

// Placeholder scenes drawn with emoji until the approved Hahn picture sets arrive. Each set has a
// left picture and a right picture; a difference counts when tapped in either one.
interface Item { e: string; x: number; y: number }
interface Diff { i: number; to: string | null } // change item i into `to`, or remove it
interface Scene { name: string; items: Item[]; diffs: Diff[] }

const SCENES: Scene[] = [
  {
    name: 'Nexus garden',
    items: [
      { e: '🌳', x: 15, y: 25 }, { e: '🏫', x: 50, y: 20 }, { e: '☀️', x: 85, y: 12 }, { e: '🐺', x: 22, y: 62 },
      { e: '🌸', x: 50, y: 70 }, { e: '🦋', x: 78, y: 45 }, { e: '⭐', x: 38, y: 45 }, { e: '🔮', x: 82, y: 78 },
    ],
    diffs: [{ i: 1, to: '🏰' }, { i: 3, to: '🦊' }, { i: 5, to: null }, { i: 6, to: '🌙' }, { i: 7, to: '🔑' }],
  },
  {
    name: 'Arcade night',
    items: [
      { e: '🕹️', x: 18, y: 22 }, { e: '🎮', x: 52, y: 18 }, { e: '👾', x: 84, y: 24 }, { e: '🎯', x: 28, y: 58 },
      { e: '🏆', x: 62, y: 55 }, { e: '💎', x: 85, y: 70 }, { e: '🚀', x: 15, y: 82 }, { e: '🎲', x: 50, y: 84 },
    ],
    diffs: [{ i: 0, to: '🎹' }, { i: 2, to: null }, { i: 4, to: '🥇' }, { i: 6, to: '🛸' }, { i: 7, to: '🧩' }],
  },
  {
    name: 'Mystery lab',
    items: [
      { e: '🔬', x: 16, y: 24 }, { e: '📚', x: 50, y: 16 }, { e: '🧪', x: 84, y: 26 }, { e: '🔍', x: 30, y: 56 },
      { e: '🕯️', x: 66, y: 52 }, { e: '🗝️', x: 86, y: 76 }, { e: '🦉', x: 18, y: 80 }, { e: '📜', x: 52, y: 82 },
    ],
    diffs: [{ i: 0, to: '🔭' }, { i: 1, to: null }, { i: 3, to: '🧲' }, { i: 5, to: '🔒' }, { i: 6, to: '🐈' }],
  },
];
const HIT = 14; // percent radius

export function SpotDifference() {
  const [scene, setScene] = useState(() => SCENES[Math.floor(Math.random() * SCENES.length)]);
  const [found, setFound] = useState<number[]>([]);
  const [wrong, setWrong] = useState(0);
  const [reminder, setReminder] = useState(false);

  const again = () => { setScene(SCENES[Math.floor(Math.random() * SCENES.length)]); setFound([]); setWrong(0); setReminder(false); };
  const tap = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    const hit = scene.diffs.findIndex((d, n) => !found.includes(n) && Math.hypot(scene.items[d.i].x - x, scene.items[d.i].y - y) < HIT);
    if (hit >= 0) { setFound([...found, hit]); beep(700, 150, 'triangle'); burst(e.clientX, e.clientY, '#fbbf24', 14, 70); popup(e.clientX, e.clientY, 'Found it!', '#fbbf24'); setReminder(false); return; }
    beep(160, 200, 'sawtooth'); burst(e.clientX, e.clientY, '#ff5c7a', 6, 30); shake(e.currentTarget, 4); flashEdge();
    if (wrong + 1 >= 3) { setWrong(0); setReminder(true); } else setWrong(wrong + 1);
  };

  if (found.length === scene.diffs.length) return <GameFrame title="Spot the Difference"><WinPanel game="spot-difference" message="You found every difference!" onAgain={again} /></GameFrame>;

  const board = (right: boolean) => (
    <div className="spot-board" onPointerDown={tap} aria-label={right ? 'Right picture' : 'Left picture'}>
      {scene.items.map((it, i) => {
        const d = scene.diffs.find((x) => x.i === i);
        const shown = right && d ? d.to : it.e;
        return shown ? <span key={i} className="spot-item" style={{ left: `${it.x}%`, top: `${it.y}%` }}>{shown}</span> : null;
      })}
      {scene.diffs.map((d, n) => found.includes(n) && <i key={n} className="spot-ring" style={{ left: `${scene.items[d.i].x}%`, top: `${scene.items[d.i].y}%` }} />)}
    </div>
  );
  return (
    <GameFrame title="Spot the Difference" hint={`${scene.name}: find ${scene.diffs.length} differences. ${found.length} found.`}>
      {reminder && <p className="note focus" role="status">Take a breath and look closely. Compare one corner at a time!</p>}
      <div className="spot-pair">{board(false)}{board(true)}</div>
      <p className="note">Wrong taps: {wrong} of 3</p>
    </GameFrame>
  );
}
