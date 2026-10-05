import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { Pager } from '../components/Pager.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import { HOUSE_POWERS, type HouseState, type Leaderboard } from '../lib/backend.ts';

export const powerIcon = (id: string) => HOUSE_POWERS.find((p) => p.id === id)?.icon ?? '🏰';
const PER_PAGE = 5;
const chunk = <T,>(list: T[], n: number): T[][] => Array.from({ length: Math.max(1, Math.ceil(list.length / n)) }, (_, i) => list.slice(i * n, i * n + n));
const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`);
const pts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function House() {
  const { backend, go } = useSession();
  const [state, setState] = useState<HouseState | null>(null);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [mode, setMode] = useState<'week' | 'season'>('week');
  const [error, setError] = useState('');
  const load = useCallback(() => {
    backend.houseState().then(setState).catch(() => setState({ state: 'none', weekPoints: 0, cap: 80 }));
    backend.leaderboard().then(setBoard).catch(() => setBoard({ minMembers: 3, houses: [], heroes: [] }));
  }, [backend]);
  useEffect(() => { load(); }, [load]);
  const vote = async (id: number) => { setError(''); try { await backend.houseVote(id); } catch { setError("That didn't work. Please try again."); } load(); };

  if (!state || !board) return <main className="screen"><ScreenBar title="House" onBack={() => go('home')} /><div className="spinner" /></main>;

  const houses = [...board.houses].sort((a, b) => (mode === 'week' ? a.rankWeek - b.rankWeek : a.rankSeason - b.rankSeason));
  const heroes = [...board.heroes].sort((a, b) => (mode === 'week' ? a.rankWeek - b.rankWeek : a.rankSeason - b.rankSeason));
  const toggle = (
    <div className="chips">
      <button className={`chip${mode === 'week' ? ' chosen' : ''}`} onClick={() => setMode('week')}>This week</button>
      <button className={`chip${mode === 'season' ? ' chosen' : ''}`} onClick={() => setMode('season')}>Season</button>
    </div>
  );
  const rankPage = (title: string, rows: ReactNode[], empty: string): ReactNode[] =>
    chunk(rows, PER_PAGE).map((page, i) => (
      <div className="list-page" key={title + i}>
        <h3 className="page-title">{title}</h3>
        {toggle}
        {rows.length === 0 ? <p className="empty">{empty}</p> : page}
      </div>
    ));

  const mine = (
    <div className="list-page" key="mine">
      {state.state === 'active' && state.house && (
        <div className="card house-card" style={{ borderColor: state.house.color }}>
          <div className="house-crest" style={{ background: state.house.color }}>{powerIcon(state.house.power)}</div>
          <b className="house-name">{state.house.name}</b>
          {state.house.motto && <p className="muted">“{state.house.motto}”</p>}
          <p className="muted">{state.className} · {state.members} heroes</p>
        </div>
      )}
      {state.state === 'voting' && state.options && (
        <>
          <h3 className="page-title">Vote for your House!</h3>
          {state.options.map((o) => (
            <button key={o.id} className={`card house-option${state.myVote === o.id ? ' chosen' : ''}`} style={{ borderColor: o.color }} onClick={() => vote(o.id)}>
              <span className="house-crest small" style={{ background: o.color }}>{powerIcon(o.power)}</span>
              <span><b>{o.name}</b>{o.motto && <small className="muted"> “{o.motto}”</small>}</span>
              {state.myVote === o.id && <span>✓</span>}
            </button>
          ))}
          <p className="note">{state.myVote ? 'Your vote is in. You can change it until your teacher closes the vote.' : 'Tap the House you like best.'}</p>
        </>
      )}
      {state.state === 'none' && <div className="card"><b>No House yet</b><p className="muted">Your teacher will start a class vote to make your House.</p></div>}
      {state.state === 'no_class' && <div className="card"><b>Join a class first</b><p className="muted">Houses are made by classes. Join yours from Missions with the class code.</p></div>}
      <div className="card">
        <b>House points this week: {state.weekPoints} / {state.cap}</b>
        <p className="muted">Every right answer in Learn and class missions earns 2 points. Your points are shared out across your whole House.</p>
      </div>
      <p className="error" role="alert">{error}</p>
    </div>
  );

  const houseRows = houses.map((h) => (
    <div className={`card rank-row${h.mine ? ' mine' : ''}`} key={h.name} style={{ borderColor: h.color }}>
      <b className="rank">{medal(mode === 'week' ? h.rankWeek : h.rankSeason)}</b>
      <span className="house-crest small" style={{ background: h.color }}>{powerIcon(h.power)}</span>
      <span className="grow"><b>{h.name}</b><small className="muted"> Grade {h.grade}</small></span>
      <b>{pts(mode === 'week' ? h.week : h.season)}</b>
    </div>
  ));
  const heroRows = heroes.map((h) => (
    <div className={`card rank-row${h.me ? ' mine' : ''}`} key={h.name + h.rankSeason}>
      <b className="rank">{medal(mode === 'week' ? h.rankWeek : h.rankSeason)}</b>
      <HeroArt id={h.starter} className="mini-hero" />
      <span className="grow"><b>{h.me ? `${h.name} (you)` : h.name}</b></span>
      <b>{mode === 'week' ? h.week : h.season}</b>
    </div>
  ));

  return (
    <main className="screen">
      <ScreenBar title="House" onBack={() => go('home')} />
      <div className="paged">
        <Pager pages={[
          mine,
          ...rankPage('Houses (points per hero)', houseRows, `Houses appear here once ${board.minMembers} classmates have joined.`),
          ...rankPage('Top heroes in your grade', heroRows, 'Earn points in Learn to get on the board!'),
        ]} />
      </div>
    </main>
  );
}
