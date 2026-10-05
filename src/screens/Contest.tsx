import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { ItemGrid } from '../components/ItemGrid.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import { CONTEST_POINTS, type ContestEntry, type ContestState } from '../lib/contest.ts';
import { ROOM_COLS, ROOM_ROWS, itemById } from '../lib/shop-catalog.ts';

function RoomMini({ e }: { e: ContestEntry }) {
  return (
    <div className="dorm mini" style={{ gridTemplateColumns: `repeat(${ROOM_COLS}, 1fr)`, gridTemplateRows: `repeat(${ROOM_ROWS}, 1fr)` }}>
      {Array.from({ length: ROOM_COLS * ROOM_ROWS }, (_, cell) => <span key={cell} className="dorm-cell">{itemById(e.layout.find((x) => x.cell === cell)?.item ?? '')?.icon}</span>)}
      <HeroArt id={e.starter} className="mini-hero" />
    </div>
  );
}

/** Weekly room contest: enter your room and vote for a squad or House mate's room. */
export function Contest() {
  const { backend, go, refresh } = useSession();
  const [s, setS] = useState<ContestState | null>(null);
  const [tab, setTab] = useState<'now' | 'last'>('now');
  const [note, setNote] = useState('');
  const load = useCallback(() => { backend.contestState().then(setS).catch(() => setNote("Couldn't load the contest.")); }, [backend]);
  useEffect(load, [load]);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); setNote(ok); refresh().catch(() => undefined); load(); } catch { setNote("That didn't work."); }
  };
  if (!s) return <main className="screen"><ScreenBar title="Room Contest" onBack={() => go('home')} /><div className="spinner" /></main>;
  return (
    <main className="screen">
      <ScreenBar title="Room Contest" onBack={() => go('home')} />
      <div className="chips"><button className={`chip${tab === 'now' ? ' chosen' : ''}`} onClick={() => setTab('now')}>This week</button><button className={`chip${tab === 'last' ? ' chosen' : ''}`} onClick={() => setTab('last')}>Last week</button></div>
      {tab === 'now' ? (
        <>
          <p className="hint">This week: <b>{s.theme}</b>. Vote once for a squad or House mate.</p>
          <ItemGrid perPage={1} items={s.entries} empty="No rooms from your squad or House yet." render={(e) => (
            <div key={e.hero} className="contest-card">
              <b>{e.name}'s room</b>
              <RoomMini e={e} />
              <button className={`btn${e.mineVote ? ' primary' : ''}`} disabled={s.voted} onClick={() => act(() => backend.contestVote(e.hero), `Voted! +${CONTEST_POINTS.vote} 💎`)}>{e.mineVote ? '✓ Your vote' : 'Vote'}</button>
            </div>
          )} />
          <p className="note" role="status">{note || (s.entered ? 'Your room is in!' : s.hasRoom ? '' : 'Decorate your room first (My Room).')}</p>
          {!s.entered && <button className="btn primary" disabled={!s.hasRoom} onClick={() => act(() => backend.contestEnter(), `Room entered! +${CONTEST_POINTS.enter} 💎`)}>Enter my room (+{CONTEST_POINTS.enter} 💎)</button>}
        </>
      ) : (
        <>
          <p className="hint">Last week: <b>{s.last.theme}</b></p>
          <div className="panel">
            {!s.last.entered ? <p>You did not enter last week.</p> : <p>Your room got <b>{s.last.votes}</b> vote{s.last.votes === 1 ? '' : 's'}. {s.last.won ? '🏆 Top room in your squad and House!' : ''}</p>}
          </div>
          <p className="note" role="status">{note}</p>
          {s.last.won && !s.last.claimed && <button className="btn primary" onClick={() => act(() => backend.contestClaim(), `Prize claimed! +${CONTEST_POINTS.win} 💎`)}>Claim prize (+{CONTEST_POINTS.win} 💎)</button>}
        </>
      )}
    </main>
  );
}
