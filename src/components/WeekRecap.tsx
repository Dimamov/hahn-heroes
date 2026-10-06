import { useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { SUBJECT_INFO } from '../screens/Learn.tsx';
import { recapBest, recapCheer, recapHasNews, recapWeeksBack } from '../lib/recap.ts';
import type { WeekSummary } from '../lib/backend.ts';

const seenKey = (heroId: string, weekStart: string) => `hh-recap-${heroId}-${weekStart}`;

/** On Sunday (this week) and Monday (last week) the first visit to Home shows a short recap once. */
export function WeekRecap() {
  const { backend, hero, go } = useSession();
  const [w, setW] = useState<WeekSummary | null>(null);
  useEffect(() => {
    const back = recapWeeksBack(new Date());
    if (back === null) return;
    backend.myWeek(back).then((x) => {
      let seen = false;
      try { seen = localStorage.getItem(seenKey(hero.id, x.weekStart)) === '1'; } catch { /* blocked storage: show it */ }
      if (!seen && recapHasNews(x)) setW(x);
    }).catch(() => undefined);
  }, [backend, hero.id]);
  if (!w) return null;
  const close = () => {
    try { localStorage.setItem(seenKey(hero.id, w.weekStart), '1'); } catch { /* blocked storage */ }
    setW(null);
  };
  const best = recapBest(w);
  const info = best ? SUBJECT_INFO[best as keyof typeof SUBJECT_INFO] : null;
  return (
    <div className="opicker" role="dialog" aria-label="Your week">
      <div className="card recap">
        <b>🎉 Your week</b>
        <div className="progress-card learn">
          <div><b>📅 {w.daysActive}</b><small>days active</small></div>
          <div><b>✅ {w.correct}/{w.answered}</b><small>right</small></div>
          <div><b>💎 {w.points}</b><small>points</small></div>
          <div><b>🎯 {w.missions}</b><small>missions</small></div>
        </div>
        {info && <small>Best subject: {info.icon} {info.label}</small>}
        <p className="hint">{recapCheer(w)}</p>
        <button className="btn primary" onClick={() => { close(); go('myweek'); }}>See my week</button>
        <button className="btn ghost" onClick={close}>Close</button>
      </div>
    </div>
  );
}
