import { useEffect, useState } from 'react';
import type { Backend, ClassInfo, StudentQuestion } from '../../lib/backend.ts';
import { ScreenBar } from '../../components/ScreenBar.tsx';

/** Teacher: approve the questions your students wrote, then turn approved ones into a class quiz. */
export function StudentQuestions({ backend, cls, onBack }: { backend: Backend; cls: ClassInfo; onBack: () => void }) {
  const [list, setList] = useState<StudentQuestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = () => backend.studentQList(cls.id).then(setList).catch(() => setList([]));
  useEffect(() => { void load(); }, [backend, cls.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (fn: () => Promise<unknown>, done = '') => { setBusy(true); setMsg(''); try { await fn(); setMsg(done); await load(); } catch { setMsg("That didn't work. Please try again."); } setBusy(false); };
  const approved = (list ?? []).filter((q) => q.status === 'approved').length;
  return (
    <main className="screen live wide">
      <ScreenBar title={`Student questions · ${cls.name}`} onBack={onBack} />
      <div className="live-setup">
        <p className="hint">Students write questions from their Class Missions screen. Nothing reaches the class until you approve it.</p>
        <section className="card goal-card">
          <b>{approved} approved</b>
          <p className="hint">Make a class quiz from approved questions (3 to 10).</p>
          <button className="btn primary" disabled={busy || approved < 3} onClick={() => run(() => backend.studentQMakeQuiz(cls.id, `Student quiz ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`), 'Quiz made! Find it in your class missions.')}>Make a quiz</button>
          <p className="note" role="status">{msg}</p>
        </section>
        {list === null ? <div className="spinner" /> : list.length === 0 ? <p className="hint">No questions waiting.</p> : list.map((q) => (
          <section className="card goal-card" key={q.id}>
            <div className="card-top"><b>{q.prompt}</b><span className="reward">{q.by}</span></div>
            <ol className="sq-choices">{(q.choices ?? []).map((c, i) => <li key={i} className={i === q.answer ? 'right' : ''}>{c}</li>)}</ol>
            {q.explanation && <small className="muted">{q.explanation}</small>}
            {q.status === 'pending'
              ? <div className="btn-grid">
                  <button className="btn ghost" disabled={busy} onClick={() => run(() => backend.studentQDecide(q.id, false))}>No thanks</button>
                  <button className="btn primary" disabled={busy} onClick={() => run(() => backend.studentQDecide(q.id, true))}>Approve</button>
                </div>
              : <span className="chip-status">✅ Approved</span>}
          </section>
        ))}
      </div>
    </main>
  );
}
