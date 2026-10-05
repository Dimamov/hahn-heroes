import { useEffect, useState } from 'react';
import type { Backend, ClassInfo, ClassReport, ClassReportStudent, SubjectProgress, WeekSummary } from '../../lib/backend.ts';
import { ScreenBar } from '../../components/ScreenBar.tsx';
import { PagedList } from '../../components/PagedList.tsx';
import { SUBJECT_INFO } from '../Learn.tsx';

const niceDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const pct = (c: number, a: number) => (a ? Math.round((100 * c) / a) : 0);
/** A student who did nothing, or is under 60% right, gets a gentle flag so the teacher can check in. */
const needsCheckIn = (s: { answered: number; correct: number }) => s.answered === 0 || pct(s.correct, s.answered) < 60;

function WeekChips({ back, onBack }: { back: number; onBack: (n: number) => void }) {
  return (
    <div className="chips">
      <button className={`chip${back === 0 ? ' chosen' : ''}`} onClick={() => onBack(0)}>This week</button>
      <button className={`chip${back === 1 ? ' chosen' : ''}`} onClick={() => onBack(1)}>Last week</button>
    </div>
  );
}

/** One class, one school week: a row per student, with a printable sheet. */
export function ClassReportScreen({ backend, cls, onBack }: { backend: Backend; cls: ClassInfo; onBack: () => void }) {
  const [back, setBack] = useState(0);
  const [r, setR] = useState<ClassReport | null>(null);
  const [student, setStudent] = useState<ClassReportStudent | null>(null);
  useEffect(() => { setR(null); backend.classReport(cls.id, back).then(setR).catch(() => setR({ weekStart: '', className: cls.name, students: [] })); }, [backend, cls.id, cls.name, back]);

  if (student) return <StudentReport backend={backend} student={student} onBack={() => setStudent(null)} />;
  const total = (r?.students ?? []).reduce((t, s) => ({ answered: t.answered + s.answered, correct: t.correct + s.correct, points: t.points + s.points, missions: t.missions + s.missions }), { answered: 0, correct: 0, points: 0, missions: 0 });
  return (
    <main className="screen">
      <ScreenBar title={`${cls.name}: report`} onBack={onBack} />
      <WeekChips back={back} onBack={setBack} />
      {r === null ? <div className="spinner" /> : (
        <>
          <p className="hint">{r.weekStart ? `Week of ${niceDay(r.weekStart)} · ` : ''}{r.students.length} students · {pct(total.correct, total.answered)}% right · tap a name for details</p>
          <PagedList items={r.students} perPage={3} empty="No students have joined this class yet."
            render={(s) => (
              <button className="card clickable report-row" key={s.id} onClick={() => setStudent(s)}>
                <span>{needsCheckIn(s) ? '⚠️ ' : ''}{s.name}</span>
                <span>{s.answered === 0 ? 'no practice' : `${s.correct}/${s.answered} right · ${s.daysActive}d`}</span>
              </button>
            )} />
          <button className="btn primary" disabled={!r.students.length} onClick={() => window.print()}>🖨 Print this report</button>
          <div className="report-sheet print-only">
            <h2>{cls.name}: progress report</h2>
            <p>Week of {r.weekStart ? niceDay(r.weekStart) : ''} · printed {new Date().toLocaleDateString()}</p>
            <table>
              <thead><tr><th>Student</th><th>Days active</th><th>Right / answered</th><th>Points</th><th>Missions</th></tr></thead>
              <tbody>
                {r.students.map((s) => (
                  <tr key={s.id}><td>{needsCheckIn(s) ? '⚠ ' : ''}{s.name}</td><td>{s.daysActive}</td><td>{s.correct}/{s.answered} ({pct(s.correct, s.answered)}%)</td><td>{s.points}</td><td>{s.missions}</td></tr>
                ))}
                <tr className="total"><td>Class</td><td /><td>{total.correct}/{total.answered} ({pct(total.correct, total.answered)}%)</td><td>{total.points}</td><td>{total.missions}</td></tr>
              </tbody>
            </table>
            <p>⚠ = no practice this week, or under 60% right. Check in with this student.</p>
          </div>
        </>
      )}
    </main>
  );
}

/** One student's week plus the skills they are strong or shaky in, printable. */
function StudentReport({ backend, student, onBack }: { backend: Backend; student: ClassReportStudent; onBack: () => void }) {
  const [back, setBack] = useState(0);
  const [w, setW] = useState<WeekSummary | null>(null);
  const [learn, setLearn] = useState<SubjectProgress[]>([]);
  useEffect(() => { backend.childLearning(student.id).then(setLearn).catch(() => setLearn([])); }, [backend, student.id]);
  useEffect(() => { setW(null); backend.childWeek(student.id, back).then(setW).catch(() => setW({ weekStart: '', daysActive: 0, answered: 0, correct: 0, subjects: [], points: 0, missions: 0 })); }, [backend, student.id, back]);
  const skills = learn.flatMap((s) => s.skills.filter((k) => k.attempts >= 3).map((k) => ({ subject: s.subject, ...k })));
  const label = (k: { subject: SubjectProgress['subject']; skill: string }) => `${SUBJECT_INFO[k.subject].label}: ${k.skill.replace(/-/g, ' ')}`;
  const weak = skills.filter((k) => pct(k.correct, k.attempts) < 60).slice(0, 3);
  const strong = skills.filter((k) => pct(k.correct, k.attempts) >= 80).slice(0, 3);
  return (
    <main className="screen">
      <ScreenBar title={student.name} onBack={onBack} />
      <WeekChips back={back} onBack={setBack} />
      {w === null ? <div className="spinner" /> : (
        <div className="report-sheet">
          <h2 className="print-only">{student.name}: progress report</h2>
          <p className="hint">{w.weekStart ? `Week of ${niceDay(w.weekStart)}` : ''}</p>
          <div className="progress-card learn">
            <div><b>📅 {w.daysActive}</b><small>days active</small></div>
            <div><b>✅ {w.correct}/{w.answered}</b><small>right{w.answered ? ` · ${pct(w.correct, w.answered)}%` : ''}</small></div>
            <div><b>💎 {w.points}</b><small>points earned</small></div>
            <div><b>🎯 {w.missions}</b><small>missions done</small></div>
          </div>
          {w.subjects.map((s) => (
            <div className="skill-row" key={s.subject}><span>{SUBJECT_INFO[s.subject].icon} {SUBJECT_INFO[s.subject].label}</span><span>{s.correct}/{s.answered} right</span></div>
          ))}
          {weak.length > 0 && <p className="note">Needs practice: {weak.map(label).join(', ')}</p>}
          {strong.length > 0 && <p className="note">Doing great: {strong.map(label).join(', ')}</p>}
        </div>
      )}
      <button className="btn primary" onClick={() => window.print()}>🖨 Print this report</button>
    </main>
  );
}
