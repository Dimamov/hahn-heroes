import { useEffect, useState } from 'react';
import type { Backend, ClassInfo, PracticeAssignment } from '../../lib/backend.ts';
import { ScreenBar } from '../../components/ScreenBar.tsx';

const SUBJECTS: [string, string][] = [['mixed', 'Mixed'], ['math', 'Math'], ['vocab', 'Words'], ['reading', 'Reading'], ['science', 'Science']];
const label = (k: string) => SUBJECTS.find(([s]) => s === k)?.[1] ?? k;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

/** Homework helper: assign practice and see who finished before class. */
export function ClassPractice({ backend, cls, onBack }: { backend: Backend; cls: ClassInfo; onBack: () => void }) {
  const [list, setList] = useState<PracticeAssignment[] | null>(null);
  const [subject, setSubject] = useState('math');
  const [target, setTarget] = useState(15);
  const [due, setDue] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = () => backend.classPracticeList(cls.id).then(setList).catch(() => setList([]));
  useEffect(() => { void load(); }, [backend, cls.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(''); try { await fn(); await load(); } catch { setError("That didn't work. Please try again."); } setBusy(false); };

  return (
    <main className="screen live wide">
      <ScreenBar title={`Homework helper · ${cls.name}`} onBack={onBack} />
      <div className="live-setup">
        <section className="card goal-card">
          <b>Assign practice</b>
          <div className="chips">{SUBJECTS.map(([k, l]) => <button key={k} className={`chip${subject === k ? ' chosen' : ''}`} onClick={() => setSubject(k)}>{l}</button>)}</div>
          <div className="chips">{[10, 15, 20, 30].map((n) => <button key={n} className={`chip${target === n ? ' chosen' : ''}`} onClick={() => setTarget(n)}>{n} questions</button>)}</div>
          <div className="chips">{[[1, 'Tomorrow'], [2, 'In 2 days'], [3, 'In 3 days'], [7, 'Next week']].map(([n, l]) => <button key={n} className={`chip${due === n ? ' chosen' : ''}`} onClick={() => setDue(n as number)}>{l}</button>)}</div>
          <p className="error" role="alert">{error}</p>
          <button className="btn primary" disabled={busy} onClick={() => run(() => backend.classPracticeAssign(cls.id, subject, target, iso(inDays(due))))}>Assign</button>
        </section>
        {list === null ? <div className="spinner" /> : list.length === 0 ? <p className="hint">Nothing assigned yet.</p> : list.map((a) => {
          const kids = a.students ?? [];
          const done = kids.filter((s) => s.done >= a.target);
          return (
            <section className="card goal-card" key={a.id}>
              <div className="card-top"><b>{a.target} {label(a.subject)} questions</b><span className="reward">Due {a.due}</span></div>
              <p className="hint">{done.length} of {kids.length} finished</p>
              <div className="chips">{kids.map((s, i) => <span key={i} className={`chip${s.done >= a.target ? ' chosen' : ''}`}>{s.name} {Math.min(s.done, a.target)}/{a.target}</span>)}</div>
              <button className="btn small ghost" disabled={busy} onClick={() => run(() => backend.classPracticeCancel(a.id))}>Remove</button>
            </section>
          );
        })}
      </div>
    </main>
  );
}
