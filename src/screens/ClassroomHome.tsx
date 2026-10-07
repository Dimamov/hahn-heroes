import { useEffect } from 'react';
import type { ClassLiveOpen } from '../lib/backend.ts';
import { useSession } from '../App.tsx';
import { HeroArt } from '../components/HeroArt.tsx';

const TILES: { id: string; label: string; icon: string; sub: string; tint: string; key: string; dot?: 'mission' }[] = [
  { id: 'learn', label: 'Learn', icon: '🧠', sub: 'Math, words, reading', tint: '#34d399', key: '1' },
  { id: 'missions', label: 'Class missions', icon: '📋', sub: 'From your teacher', tint: '#22d3ee', key: '2', dot: 'mission' },
  { id: 'house', label: 'My House', icon: '🏰', sub: 'Class points', tint: '#fb923c', key: '3' },
  { id: 'quiet', label: 'Quiet time', icon: '🤫', sub: 'Calm word puzzles', tint: '#60a5fa', key: '4' },
  { id: 'hero', label: 'My Hero', icon: '🦸', sub: 'Skills and look', tint: '#a78bfa', key: '5' },
  { id: 'sensei', label: 'Ask the Sensei', icon: '🧙', sub: 'Need help?', tint: '#c084fc', key: '6' },
];

/** The student home while the teacher has classroom mode on, on a school Chromebook: one big live-game button and a few class tiles. */
export function ClassroomHome({ live }: { live: ClassLiveOpen | null }) {
  const { hero, balances, missionDot, go } = useSession();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'j') go('classlive');
      const t = TILES.find((x) => x.key === k);
      if (t) go(t.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);
  const level = Math.floor(balances.xp / 100) + 1;
  const kind = live?.kind === 'boss' ? 'boss battle' : live?.kind === 'mystery' ? 'mystery reveal' : live?.kind === 'duel' ? 'vocab duel' : 'quiz battle';
  return (
    <main className="screen classroom">
      <header className="cr-top">
        <img className="cr-logo" src="/assets/brand/logo-hahn-heroes.webp" alt="HAHN Heroes" width={900} height={622} draggable={false} />
        <span className="cr-badge">🏫 Classroom mode</span>
        <span className="cr-me"><HeroArt id={hero.starter} /><b>Level {level}</b><small>⭐ {balances.xp} · 💎 {balances.coins}</small></span>
      </header>
      <div className="cr-body">
        <button className={`cr-live${live ? ' open' : ''}`} onClick={() => go('classlive')}>
          <span className="cr-live-icon" aria-hidden>{live ? '⚡' : '📺'}</span>
          <b>{live ? `Join the ${kind}!` : 'Live class game'}</b>
          <small>{live ? 'Your teacher started a game. Press J or click here.' : 'Waiting for your teacher to start. You can also type the code here.'}</small>
        </button>
        <div className="cr-tiles">
          {TILES.map((t) => (
            <button key={t.id} className="cr-tile" style={{ ['--tint' as string]: t.tint }} onClick={() => go(t.id)}>
              {t.dot === 'mission' && missionDot && <i className="red-dot" aria-label="Something is waiting" />}
              <span className="cr-icon" aria-hidden>{t.icon}</span>
              <span><b>{t.label}</b><small>{t.sub}</small></span>
              <kbd aria-hidden>{t.key}</kbd>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
