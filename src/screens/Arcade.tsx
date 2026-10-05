import { useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import type { ArcadeStatus } from '../lib/backend.ts';

export const GAMES = [
  { id: 'pattern-pulse', label: 'Pattern Pulse', icon: '💡', reward: true },
  { id: 'memory-flip', label: 'Memory Flip', icon: '🃏', reward: true },
  { id: 'word-builder', label: 'Word Builder', icon: '🔠', reward: true },
  { id: 'spot-difference', label: 'Spot the Difference', icon: '🔍', reward: true },
  { id: 'trivia-clash', label: 'Trivia Clash (with friends)', icon: '⚔️', reward: false },
  { id: 'odin', label: 'ODIN (card game)', icon: '🎴', reward: false },
  { id: 'word-rush', label: 'Word Rush (pass the device)', icon: '⏱️', reward: false },
  { id: 'fun-box', label: 'Fun Box', icon: '🎁', reward: false },
] as const;

/** Solo games. Squad games (ODIN, Trivia Clash and more) arrive with squad play. */
export function Arcade() {
  const { backend, go } = useSession();
  const [status, setStatus] = useState<ArcadeStatus | null>(null);
  useEffect(() => { backend.arcadeStatus().then(setStatus).catch(() => setStatus({ coins: 5, games: [], claimed: [] })); }, [backend]);
  return (
    <main className="screen">
      <ScreenBar title="Arcade" onBack={() => go('home')} />
      <p className="hint">Solo games, Trivia Clash and ODIN. Win a ⭐ game to collect points once a day.</p>
      <div className="subjects">
        {GAMES.map((g) => {
          const open = g.reward && status && status.games.includes(g.id) && !status.claimed.includes(g.id);
          const done = g.reward && status?.claimed.includes(g.id);
          return (
            <button className="folder subject" key={g.id} onClick={() => go(`game:${g.id}`)}>
              {open && <i className="red-dot" aria-label="Reward waiting" />}
              <span className="folder-icon" aria-hidden>{g.icon}</span>
              <b>{g.label}</b>
              <em>{done ? '✅ Collected today' : g.reward ? '⭐ Daily reward' : g.id === 'trivia-clash' || g.id === 'odin' ? 'Private rooms' : 'Just for fun'}</em>
            </button>
          );
        })}
      </div>
      <p className="note">🔒 More squad games (Squad Drawing and more) arrive soon.</p>
    </main>
  );
}
