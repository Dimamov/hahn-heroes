import { useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { PagedList } from '../components/PagedList.tsx';
import type { RaceState } from '../lib/race.ts';

const MEDALS = ['🥇', '🥈', '🥉'];
const monthName = (m: string) => new Date(`${m}T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

/** Class vs class race: which class has the most learning points this month. Class names only. */
export function Race() {
  const { backend, go } = useSession();
  const [back, setBack] = useState(0);
  const [s, setS] = useState<RaceState | null>(null);
  useEffect(() => { setS(null); backend.raceState(back).then(setS).catch(() => setS({ month: '', minMembers: 3, classes: [] })); }, [backend, back]);
  return (
    <main className="screen">
      <ScreenBar title="Class Race" onBack={() => go('home')} />
      <div className="chips"><button className={`chip${back === 0 ? ' chosen' : ''}`} onClick={() => setBack(0)}>This month</button><button className={`chip${back === 1 ? ' chosen' : ''}`} onClick={() => setBack(1)}>Last month</button></div>
      {!s ? <div className="spinner" /> : (
        <>
          <p className="hint">{s.month ? monthName(s.month) : ''}. Every right answer in Learn and class missions adds points for your whole class.</p>
          <PagedList items={s.classes} perPage={4} empty="No classes are in the race yet." render={(c) => (
            <div key={c.name} className={`card report-row${c.mine ? ' mine' : ''}`}>
              <b>{MEDALS[c.rank - 1] ?? `#${c.rank}`} {c.name}{c.mine ? ' (your class)' : ''}</b>
              <small>Grade {c.grade} · {c.members} heroes · {c.total} points</small>
            </div>
          )} />
        </>
      )}
    </main>
  );
}
