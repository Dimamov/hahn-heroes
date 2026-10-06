import { useEffect, useState } from 'react';
import type { Backend, ClassGoal } from '../lib/backend.ts';
import { burst, centerOf, popup } from '../lib/fx.ts';

const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/** The class streak goal. Students see progress and claim the shared reward; teachers set it and watch it. */
export function ClassGoalCard({ backend, classId, onClaimed }: { backend: Backend; classId?: string; onClaimed?: () => void }) {
  const [g, setG] = useState<ClassGoal | null | undefined>(undefined);
  const [days, setDays] = useState(4);
  const [busy, setBusy] = useState(false);
  const load = () => backend.classGoalStatus(classId).then(setG).catch(() => setG(null));
  useEffect(() => { void load(); }, [backend, classId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (g === undefined || g === null) return null;
  const teacher = !!classId;

  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); await load(); } catch { /* try again */ } setBusy(false); };
  const claim = () => run(async () => {
    const coins = await backend.classGoalClaim();
    const c = centerOf(document.querySelector('.goal-card'));
    burst(c.x, c.y, '#fbbf24', 24, 120); popup(c.x, c.y, `+${coins} 💎`, '#fbbf24', true);
    onClaimed?.();
  });

  if (!g.on) {
    if (!teacher) return null;
    return (
      <section className="card goal-card">
        <b>🔥 Class streak goal</b>
        <p className="hint">Challenge the class: most of you practice on school days this week and everyone who joined in earns a reward.</p>
        <div className="chips">{[2, 3, 4, 5].map((n) => <button key={n} className={`chip${days === n ? ' chosen' : ''}`} onClick={() => setDays(n)}>{n} days</button>)}</div>
        <button className="btn primary" disabled={busy} onClick={() => run(() => backend.classGoalSet(classId!, days, 80))}>Start the goal</button>
      </section>
    );
  }
  const hits = g.days ?? [];
  return (
    <section className="card goal-card">
      <b>🔥 Class streak goal</b>
      <p className="hint">{g.share}% of the class practices on {g.targetDays} school days this week. {g.daysHit}/{g.targetDays} done.</p>
      <div className="goal-days" aria-label="This week">
        {DAY.map((d, i) => {
          const row = hits[i];
          return <span key={d} className={`goal-day${row?.hit ? ' hit' : ''}`}>{d}<small>{row ? `${row.active}/${g.members}` : '·'}</small></span>;
        })}
      </div>
      {!teacher && (g.canClaim
        ? <button className="btn primary" disabled={busy} onClick={claim}>🎁 Claim {g.reward} 💎 for the class goal</button>
        : <p className="note">{g.claimed ? '✅ You claimed this week’s class reward.' : g.met ? 'Goal reached! Practice at least once to claim it.' : `You practiced ${g.myDays} ${g.myDays === 1 ? 'day' : 'days'} this week. Every day counts!`}</p>)}
      {teacher && <button className="btn small ghost" disabled={busy} onClick={() => run(() => backend.classGoalOff(classId!))}>Turn off</button>}
    </section>
  );
}
