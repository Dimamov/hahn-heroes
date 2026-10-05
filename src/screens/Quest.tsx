import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import type { QuestState } from '../lib/backend.ts';

/** The daily streak with its milestone rewards, and today's three-task quest. */
export function Quest() {
  const { backend, go, refresh } = useSession();
  const [q, setQ] = useState<QuestState | null>(null);
  const [note, setNote] = useState('');
  const load = useCallback(() => { backend.questState().then(setQ).catch(() => setNote("Couldn't load your quest.")); }, [backend]);
  useEffect(load, [load]);

  const act = async (run: () => Promise<{ awarded: number }>) => {
    try { const r = await run(); setNote(r.awarded ? `+${r.awarded} 💎` : ''); load(); refresh().catch(() => undefined); } catch { setNote("That isn't ready yet."); }
  };
  const done = q ? q.tasks.every((t) => t.have >= t.need) : false;
  return (
    <main className="screen quest">
      <ScreenBar title="Daily Quest" onBack={() => go('home')} />
      {!q ? <div className="spinner" /> : (
        <>
          <div className="card streak-card">
            <span className="flame" aria-hidden>🔥</span>
            <b>{q.streak} day{q.streak === 1 ? '' : 's'} in a row</b>
            <small>Collect your daily check-in every day to keep it growing.</small>
          </div>
          <div className="miles">
            {q.milestones.map((m) => (
              <button key={m.days} className={`mile${m.claimed ? ' got' : m.reached ? ' ready' : ''}`} disabled={!m.reached || m.claimed}
                onClick={() => act(() => backend.streakClaim(m.days))} aria-label={`${m.days} day streak, ${m.coins} points`}>
                {m.reached && !m.claimed && <i className="red-dot" />}
                <b>{m.days}</b><small>days</small><span>{m.claimed ? '✅' : `+${m.coins}`}</span>
              </button>
            ))}
          </div>
          <div className="card">
            <b>Today's quest</b>
            {q.tasks.map((t) => (
              <div key={t.id} className={`task${t.have >= t.need ? ' ok' : ''}`}>
                <span aria-hidden>{t.have >= t.need ? '✅' : '⬜'}</span>
                <span>{t.label}</span>
                <small>{t.have}/{t.need}</small>
              </div>
            ))}
          </div>
          <p className="note" role="status">{note}</p>
          <button className="btn primary" disabled={!done || q.questClaimed} onClick={() => act(() => backend.questClaim())}>
            {q.questClaimed ? '✅ Quest reward collected' : `Collect +${q.questCoins} 💎`}
          </button>
        </>
      )}
    </main>
  );
}
