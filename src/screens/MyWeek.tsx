import { useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { SUBJECT_INFO } from './Learn.tsx';
import type { WeekSummary } from '../lib/backend.ts';

const niceDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** A hero's own recap of the week: what they practised, what they earned, and a pat on the back. */
export function MyWeek() {
  const { backend, go } = useSession();
  const [back, setBack] = useState(0);
  const [w, setW] = useState<WeekSummary | null>(null);
  useEffect(() => {
    setW(null);
    backend.myWeek(back).then(setW).catch(() => setW({ weekStart: '', daysActive: 0, answered: 0, correct: 0, subjects: [], points: 0, missions: 0 }));
  }, [backend, back]);
  const pct = w && w.answered ? Math.round((100 * w.correct) / w.answered) : 0;
  const best = w?.subjects.filter((s) => s.answered >= 3).sort((a, b) => b.correct / b.answered - a.correct / a.answered)[0];
  const cheer = !w || w.answered === 0
    ? (back === 0 ? 'A new week is waiting. Answer a few questions to get started!' : 'No practice that week. This week is a fresh start!')
    : w.daysActive >= 5 ? '🔥 Wow, you practised almost every day!'
    : pct >= 80 ? '🌟 Super accuracy this week!'
    : 'Nice work. Every question makes you stronger!';
  return (
    <main className="screen">
      <ScreenBar title="My week" onBack={() => go('profile')} />
      <div className="chips">
        <button className={`chip${back === 0 ? ' chosen' : ''}`} onClick={() => setBack(0)}>This week</button>
        <button className={`chip${back === 1 ? ' chosen' : ''}`} onClick={() => setBack(1)}>Last week</button>
      </div>
      {w === null ? <div className="spinner" /> : (
        <>
          <p className="hint">{w.weekStart ? `Week of ${niceDay(w.weekStart)}` : ''}</p>
          <div className="progress-card learn">
            <div><b>📅 {w.daysActive}</b><small>days active</small></div>
            <div><b>✅ {w.correct}/{w.answered}</b><small>right{w.answered ? ` · ${pct}%` : ''}</small></div>
            <div><b>💎 {w.points}</b><small>points earned</small></div>
            <div><b>🎯 {w.missions}</b><small>missions done</small></div>
          </div>
          {best && <p className="note">Best subject: {SUBJECT_INFO[best.subject].icon} {SUBJECT_INFO[best.subject].label}</p>}
          <p className="hint" role="status">{cheer}</p>
        </>
      )}
      <div className="grow" />
      <button className="btn primary" onClick={() => go('learn')}>🧠 Practice now</button>
    </main>
  );
}
