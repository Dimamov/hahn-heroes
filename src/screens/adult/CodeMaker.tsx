import { useEffect, useState } from 'react';
import type { Backend, ClassInfo } from '../../lib/backend.ts';
import { ScreenBar } from '../../components/ScreenBar.tsx';
import { PagedList } from '../../components/PagedList.tsx';
import { CODE_LIMITS, type MadeCode } from '../../lib/codes.ts';

const COIN_CHOICES = { teacher: [0, 1, 2, 3, 5], sensei: [0, 5, 10, 25, 50] } as const;
const XP_CHOICES = { teacher: [0, 5, 10, 15, 25], sensei: [0, 25, 50, 100, 200] } as const;

/** Make a secret code word. A teacher makes one a day for a class; the Sensei makes codes for everyone. */
export function CodeMaker({ backend, cls, onBack }: { backend: Backend; cls?: ClassInfo; onBack: () => void }) {
  const kind = cls ? 'teacher' : 'sensei';
  const [coins, setCoins] = useState(kind === 'teacher' ? 2 : 10);
  const [xp, setXp] = useState(kind === 'teacher' ? 10 : 50);
  const [announce, setAnnounce] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  const [mine, setMine] = useState<MadeCode[] | null>(null);
  const [error, setError] = useState('');
  const load = () => backend.codeMine().then(setMine).catch(() => setMine([]));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const lim = CODE_LIMITS[kind];
  const make = async () => {
    setError('');
    try { setMade(await backend.codeCreate(cls?.id ?? null, coins, xp, announce)); load(); }
    catch (e) { setError(e instanceof Error && e.message ? e.message : "That didn't work."); }
  };
  return (
    <main className="screen scrolly">
      <ScreenBar title={cls ? `Secret code: ${cls.name}` : 'Secret codes'} onBack={onBack} />
      <p className="hint">{cls ? `Make one code a day. Tell your class for a job well done. Up to ${lim.coins} 💎 and ${lim.xp} ⭐.` : `For the whole school. Up to 5 a day, ${lim.coins} 💎 and ${lim.xp} ⭐ each.`} Codes last 7 days and each hero can use one once.</p>
      {made ? (
        <div className="panel"><small>Your code</small><h2 className="code-word">{made}</h2><p className="hint">{coins} 💎 · {xp} ⭐</p>{kind === 'sensei' && <button className="btn ghost" onClick={() => setMade(null)}>Make another</button>}</div>
      ) : (
        <>
          <b>Diamonds 💎</b>
          <div className="chips">{COIN_CHOICES[kind].map((n) => <button key={n} className={`chip${coins === n ? ' chosen' : ''}`} onClick={() => setCoins(n)}>{n}</button>)}</div>
          <b>Stars ⭐</b>
          <div className="chips">{XP_CHOICES[kind].map((n) => <button key={n} className={`chip${xp === n ? ' chosen' : ''}`} onClick={() => setXp(n)}>{n}</button>)}</div>
          {kind === 'sensei' && <label className="check"><input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} /> Also post it as an announcement</label>}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary" disabled={coins + xp <= 0} onClick={make}>Make a code</button>
        </>
      )}
      <b>Your recent codes</b>
      <PagedList items={mine ?? []} perPage={3} empty={mine ? 'No codes yet.' : ''} render={(c) => (
        <div key={c.id} className="card"><b>{c.code}</b> <small>{c.className ?? 'Everyone'} · {c.coins} 💎 · {c.xp} ⭐ · used by {c.redeemed}</small></div>
      )} />
    </main>
  );
}
