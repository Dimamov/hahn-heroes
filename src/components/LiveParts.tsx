import type { ClassLivePlayer, ClassLiveState } from '../lib/backend.ts';
import { HeroArt } from './HeroArt.tsx';

const LETTERS = ['A', 'B', 'C', 'D'];
export const letter = (n: number) => LETTERS[n] ?? String(n + 1);

/** The class leaderboard. Wide screens show more rows. */
export function Board({ players, limit = 8, big = false }: { players: ClassLivePlayer[]; limit?: number; big?: boolean }) {
  const shown = players.slice(0, limit);
  const me = players.findIndex((p) => p.me);
  const rows = me >= limit ? [...shown, players[me]] : shown;
  return (
    <ol className={`live-board${big ? ' big' : ''}`} aria-label="Leaderboard">
      {rows.map((p) => {
        const rank = players.indexOf(p) + 1;
        return (
          <li key={`${p.name}-${rank}`} className={p.me ? 'me' : ''}>
            <b className="rank">{rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}</b>
            <HeroArt id={p.starter} className="chip-hero" />
            <span className="nm">{p.name}</span>
            <span className="pts">{p.score}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** The boss and how much health it has left. */
export function BossBar({ boss }: { boss: NonNullable<ClassLiveState['boss']> }) {
  const pct = boss.max ? Math.max(0, Math.round((boss.hp / boss.max) * 100)) : 0;
  return (
    <div className={`boss-bar${boss.hp <= 0 ? ' beaten' : ''}`} role="img" aria-label={`${boss.name}: ${pct} percent health left`}>
      <span className="boss-face" aria-hidden>{boss.icon}</span>
      <div className="boss-info">
        <b>{boss.name}</b>
        <div className="boss-track"><i style={{ width: `${pct}%` }} /></div>
        <small>{boss.hp <= 0 ? 'Defeated!' : `${boss.hp} / ${boss.max}`}</small>
      </div>
    </div>
  );
}

export function TimerBar({ state }: { state: ClassLiveState }) {
  const total = state.phase === 'reveal' ? 5 : state.seconds ?? 20;
  return (
    <div className="rush-timer" aria-label={`${state.secondsLeft ?? 0} seconds left`}>
      <i style={{ width: `${Math.min(100, ((state.secondsLeft ?? 0) / total) * 100)}%` }} />
    </div>
  );
}
