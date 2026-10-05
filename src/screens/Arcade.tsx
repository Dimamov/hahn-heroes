import { useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { Pager } from '../components/Pager.tsx';
import type { ArcadeStatus } from '../lib/backend.ts';

export const GAMES = [
  { id: 'pattern-pulse', label: 'Pattern Pulse', icon: '💡', reward: true },
  { id: 'memory-flip', label: 'Memory Flip', icon: '🃏', reward: true },
  { id: 'word-builder', label: 'Word Builder', icon: '🔠', reward: true },
  { id: 'spot-difference', label: 'Spot the Difference', icon: '🔍', reward: true },
  { id: 'trivia-clash', label: 'Trivia Clash', icon: '⚔️', reward: false },
  { id: 'odin', label: 'ODIN', icon: '🎴', reward: false },
  { id: 'shadow-signal', label: 'Shadow Signal', icon: '🕵️', reward: false },
  { id: 'squad-drawing', label: 'Squad Drawing', icon: '🎨', reward: false },
  { id: 'escape-nexus', label: 'Escape the Nexus', icon: '🔐', reward: false },
  { id: 'word-rush', label: 'Word Rush', icon: '⏱️', reward: false },
  { id: 'rhythm-tap', label: 'Rhythm Tap', icon: '🥁', reward: false },
  { id: 'fun-box', label: 'Fun Box', icon: '🎁', reward: false },
] as const;

const TAGLINES: Record<string, string> = {
  'trivia-clash': 'Private rooms', odin: 'Private rooms', 'squad-drawing': 'Private rooms', 'escape-nexus': 'Private rooms',
  'shadow-signal': 'Rooms or one device', 'word-rush': 'Pass the device',
};

/** Solo games and squad games, six to a page so the list never scrolls. */
export function Arcade() {
  const { backend, go } = useSession();
  const [status, setStatus] = useState<ArcadeStatus | null>(null);
  useEffect(() => { backend.arcadeStatus().then(setStatus).catch(() => setStatus({ coins: 5, games: [], claimed: [] })); }, [backend]);
  const isOpen = (g: (typeof GAMES)[number]) => !!(g.reward && status && status.games.includes(g.id) && !status.claimed.includes(g.id));
  const pages = Array.from({ length: Math.ceil(GAMES.length / 6) }, (_, i) => GAMES.slice(i * 6, i * 6 + 6));
  return (
    <main className="screen">
      <ScreenBar title="Arcade" onBack={() => go('home')} />
      <p className="hint">Solo games and squad games with friends. Win a ⭐ game to collect points once a day.</p>
      <div className="paged">
        <Pager
          badges={pages.map((page) => page.some(isOpen))}
          pages={pages.map((page, n) => (
            <div className="subjects games" key={n}>
              {page.map((g) => {
                const done = g.reward && status?.claimed.includes(g.id);
                return (
                  <button className="folder subject" key={g.id} onClick={() => go(`game:${g.id}`)}>
                    {isOpen(g) && <i className="red-dot" aria-label="Reward waiting" />}
                    <span className="folder-icon" aria-hidden>{g.icon}</span>
                    <b>{g.label}</b>
                    <em>{done ? '✅ Collected today' : g.reward ? '⭐ Daily reward' : TAGLINES[g.id] ?? 'Just for fun'}</em>
                  </button>
                );
              })}
            </div>
          ))}
        />
      </div>
      <p className="note">🎉 All the squad games are here! More surprises are coming.</p>
    </main>
  );
}
