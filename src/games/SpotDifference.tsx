import { useState } from 'react';
import { GameFrame, WinPanel } from './GameFrame.tsx';
import { beep } from '../lib/sound.ts';
import { burst, flashEdge, popup, shake } from '../lib/fx.ts';

// Six picture sets. Each has a left picture and a right picture with five changes; a difference counts
// when tapped in either one. x, y and r are percents of the picture (r is a radius in percent of its width).
interface Diff { x: number; y: number; r: number }
interface Scene { id: string; name: string; diffs: Diff[] }
const SCENES: Scene[] = [
  { id: '01', name: 'Locker hall', diffs: [{ x: 8.3, y: 74.8, r: 8 }, { x: 24.5, y: 48, r: 10 }, { x: 92.2, y: 13.9, r: 7 }, { x: 84.5, y: 35.5, r: 6 }, { x: 93.5, y: 61.3, r: 8 }] },
  { id: '02', name: 'Library desk', diffs: [{ x: 19.9, y: 50, r: 12 }, { x: 50.5, y: 21.7, r: 8 }, { x: 50, y: 66, r: 12 }, { x: 74.5, y: 44, r: 9 }, { x: 93, y: 61, r: 6 }] },
  { id: '03', name: 'Classroom', diffs: [{ x: 76.2, y: 12.9, r: 7 }, { x: 57.3, y: 47.7, r: 6 }, { x: 69.7, y: 48, r: 6 }, { x: 10.4, y: 59.4, r: 7 }, { x: 50.1, y: 81.3, r: 10 }] },
  { id: '04', name: 'Lunch room', diffs: [{ x: 52.1, y: 15.8, r: 12 }, { x: 57.3, y: 72.5, r: 9 }, { x: 73.3, y: 61.7, r: 8 }, { x: 73.6, y: 79.3, r: 7 }, { x: 50, y: 87, r: 8 }] },
  { id: '05', name: 'Science lab', diffs: [{ x: 43, y: 16.8, r: 8 }, { x: 19.5, y: 59.8, r: 8 }, { x: 35.2, y: 53.9, r: 9 }, { x: 81.4, y: 59.5, r: 7 }, { x: 50.1, y: 85.2, r: 9 }] },
  // Made from our own Episode 1 hallway art: the right picture has hair color, a missing wolf, jeans color, a star and a ball changed.
  { id: '06', name: 'Hero hallway', diffs: [{ x: 4.2, y: 31.2, r: 7 }, { x: 96, y: 9.8, r: 6 }, { x: 69, y: 85.9, r: 8.5 }, { x: 77.1, y: 86.9, r: 6 }, { x: 62.2, y: 94.7, r: 6 }] },
];
const ASPECT = 2 / 3; // picture height / width, so a tap's up and down distance counts the same as sideways

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
    const hit = scene.diffs.findIndex((d, n) => !found.includes(n) && Math.hypot(d.x - x, (d.y - y) * ASPECT) < d.r);
    if (hit >= 0) { setFound([...found, hit]); beep(700, 150, 'triangle'); burst(e.clientX, e.clientY, '#fbbf24', 14, 70); popup(e.clientX, e.clientY, 'Found it!', '#fbbf24'); setReminder(false); return; }
    beep(160, 200, 'sawtooth'); burst(e.clientX, e.clientY, '#ff5c7a', 6, 30); shake(e.currentTarget, 4); flashEdge();
    if (wrong + 1 >= 3) { setWrong(0); setReminder(true); } else setWrong(wrong + 1);
  };

  if (found.length === scene.diffs.length) return <GameFrame title="Spot the Difference"><WinPanel game="spot-difference" message="You found every difference!" onAgain={again} /></GameFrame>;

  const board = (right: boolean) => (
    <div className="spot-board" onPointerDown={tap} aria-label={right ? 'Right picture' : 'Left picture'}>
      <img src={`/assets/games/spot-${scene.id}-${right ? 'b' : 'a'}.webp`} alt="" draggable={false} />
      {scene.diffs.map((d, n) => found.includes(n) && <i key={n} className="spot-ring" style={{ left: `${d.x}%`, top: `${d.y}%`, width: `${Math.max(d.r * 1.6, 12)}%` }} />)}
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
