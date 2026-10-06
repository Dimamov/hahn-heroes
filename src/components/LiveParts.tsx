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

const PICTURES = ['/assets/games/escape-room-01-wide.webp', '/assets/games/escape-room-02-wide.webp', '/assets/games/escape-room-03-wide.webp', '/assets/games/game-tile-trivia.webp', '/assets/games/game-tile-escape.webp', '/assets/games/game-tile-pattern-pulse.webp'];
const COLS = 5, ROWS = 4;
const seed = (code: string) => [...code].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
/** A deterministic shuffle so every screen uncovers the same tiles in the same order. */
const tileOrder = (code: string): number[] => {
  let x = seed(code) || 1;
  const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  const a = Array.from({ length: COLS * ROWS }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** The hidden picture. Every right answer from the class uncovers more of it. */
export function MysteryPicture({ code, boss }: { code: string; boss: NonNullable<ClassLiveState['boss']> }) {
  const done = boss.max ? 1 - boss.hp / boss.max : 0;
  const open = boss.hp <= 0 ? COLS * ROWS : Math.floor(done * COLS * ROWS);
  const order = tileOrder(code);
  const shown = new Set(order.slice(0, open));
  const pic = PICTURES[seed(code) % PICTURES.length];
  return (
    <div className="mystery" role="img" aria-label={`Mystery picture, ${Math.round(done * 100)} percent uncovered`}>
      <img src={pic} alt="" draggable={false} />
      <div className="mystery-grid" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
        {Array.from({ length: COLS * ROWS }, (_, i) => <i key={i} className={shown.has(i) ? 'open' : ''}>{shown.has(i) ? '' : '?'}</i>)}
      </div>
    </div>
  );
}
