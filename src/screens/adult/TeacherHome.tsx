import { useEffect, useState } from 'react';
import type { Adult, Backend, ClassInfo, ClassMissionResults, NewClassMission } from '../../lib/backend.ts';
import { ScreenBar } from '../../components/ScreenBar.tsx';
import { PagedList } from '../../components/PagedList.tsx';

type View = { name: 'list' } | { name: 'new-class' } | { name: 'class'; cls: ClassInfo } | { name: 'new-mission'; cls: ClassInfo };

export function TeacherHome({ backend, adult, onSignOut }: { backend: Backend; adult: Adult; onSignOut: () => void }) {
  const [view, setView] = useState<View>({ name: 'list' });
  const [classes, setClasses] = useState<ClassInfo[] | null>(null);
  const reload = () => backend.classes().then(setClasses).catch(() => setClasses([]));
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toList = () => { reload(); setView({ name: 'list' }); };

  if (view.name === 'new-class') return <NewClass backend={backend} onBack={toList} onDone={(cls) => { reload(); setView({ name: 'class', cls }); }} />;
  if (view.name === 'class') return <ClassScreen backend={backend} cls={view.cls} onBack={toList} onNew={() => setView({ name: 'new-mission', cls: view.cls })} />;
  if (view.name === 'new-mission') return <NewClassMissionScreen backend={backend} cls={view.cls} onBack={() => setView({ name: 'class', cls: view.cls })} />;

  return (
    <main className="screen">
      <ScreenBar title={adult.displayName} onBack={onSignOut} right={<button className="btn link" onClick={onSignOut}>Sign out</button>} />
      {classes === null ? <div className="spinner" /> : (
        <PagedList items={classes} perPage={3} empty="No classes yet. Make one and give students its code."
          render={(c) => (
            <button className="card clickable" key={c.id} onClick={() => setView({ name: 'class', cls: c })}>
              <div className="card-top"><b>{c.name}</b><span className="reward">Grade {c.grade}</span></div>
              <div className="card-bottom"><span className="chip-status">{c.members ?? 0} students</span><span className="chip-status">Code {c.joinCode}</span></div>
            </button>
          )} />
      )}
      <button className="btn primary" onClick={() => setView({ name: 'new-class' })}>＋ New class</button>
    </main>
  );
}

function NewClass({ backend, onBack, onDone }: { backend: Backend; onBack: () => void; onDone: (c: ClassInfo) => void }) {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState<5 | 6>(5);
  const [error, setError] = useState('');
  const make = async () => { try { onDone(await backend.createClass(name.trim(), grade)); } catch { setError("Couldn't make that class. Please try again."); } };
  return (
    <main className="screen">
      <ScreenBar title="New class" onBack={onBack} />
      <label className="field plain"><span>Class name</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Room 12" /></label>
      <p className="hint">Grade</p>
      <div className="seg">{([5, 6] as const).map((g) => <button key={g} className={grade === g ? 'chosen' : ''} onClick={() => setGrade(g)}>Grade {g}</button>)}</div>
      <p className="error" role="alert">{error}</p>
      <div className="grow" />
      <button className="btn primary" disabled={!name.trim()} onClick={make}>Make class</button>
    </main>
  );
}

function ClassScreen({ backend, cls, onBack, onNew }: { backend: Backend; cls: ClassInfo; onBack: () => void; onNew: () => void }) {
  const [results, setResults] = useState<ClassMissionResults[] | null>(null);
  const load = () => backend.classResults(cls.id).then(setResults).catch(() => setResults([]));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const reset = async (missionId: string, childId: string) => { await backend.resetSubmission(missionId, childId).catch(() => {}); load(); };
  return (
    <main className="screen">
      <ScreenBar title={cls.name} onBack={onBack} />
      <div className="big-code" aria-label="Class code"><small>Class code</small><b>{cls.joinCode}</b></div>
      {results === null ? <div className="spinner" /> : (
        <PagedList items={results} perPage={1} empty="No class missions yet. Tap New mission to make a reading quiz."
          render={(m) => (
            <div className="card mission" key={m.id}>
              <div className="card-top"><b>{m.title}</b><span className="reward">{m.submissions.length} done</span></div>
              {m.submissions.length === 0 && <p className="muted">Nobody has finished this yet.</p>}
              {m.submissions.slice(0, 4).map((s) => (
                <div className="card-bottom" key={s.childId}>
                  <span>{s.childName} · {s.scorePct}% · 💎 {s.coins}</span>
                  <button className="btn small ghost" onClick={() => reset(m.id, s.childId)}>Retake</button>
                </div>
              ))}
              {m.submissions.length > 4 && <small className="muted">and {m.submissions.length - 4} more</small>}
            </div>
          )} />
      )}
      <button className="btn primary" onClick={onNew}>＋ New mission</button>
    </main>
  );
}

interface Draft { prompt: string; choices: string[]; correct: number; why: string }
const blank = (): Draft => ({ prompt: '', choices: ['', '', '', ''], correct: 0, why: '' });
const MIN_Q = 3;
const MAX_Q = 10;

function NewClassMissionScreen({ backend, cls, onBack }: { backend: Backend; cls: ClassInfo; onBack: () => void }) {
  const [step, setStep] = useState(0); // 0 = basics, 1.. = question number
  const [title, setTitle] = useState('');
  const [passage, setPassage] = useState('');
  const [coins, setCoins] = useState(50);
  const [drafts, setDrafts] = useState<Draft[]>([blank()]);
  const [error, setError] = useState('');

  const q = drafts[step - 1];
  const patch = (p: Partial<Draft>) => setDrafts(drafts.map((d, i) => (i === step - 1 ? { ...d, ...p } : d)));
  const filled = (d: Draft) => d.prompt.trim() && d.choices.filter((c) => c.trim()).length >= 2 && d.choices[d.correct].trim();
  const ready = drafts.length >= MIN_Q && drafts.every(filled);

  const send = async () => {
    const mission: NewClassMission = { title: title.trim(), passage: passage.trim(), maxCoins: coins, questions: [], answers: [], explanations: [] };
    for (const d of drafts) {
      // Drop empty choices, then find where the right answer ended up.
      const keep = d.choices.map((c, i) => ({ c: c.trim(), i })).filter((x) => x.c);
      mission.questions.push({ prompt: d.prompt.trim(), choices: keep.map((x) => x.c) });
      mission.answers.push(keep.findIndex((x) => x.i === d.correct));
      mission.explanations.push(d.why.trim());
    }
    try { await backend.createClassMission(cls.id, mission); onBack(); } catch { setError("Couldn't send that mission. Please try again."); }
  };

  if (step === 0) {
    return (
      <main className="screen">
        <ScreenBar title="New mission" onBack={onBack} />
        <label className="field plain"><span>Title</span><input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="The Water Cycle" /></label>
        <label className="field plain grow-field"><span>Reading passage (paste it here)</span>
          <textarea value={passage} maxLength={3000} onChange={(e) => setPassage(e.target.value)} /></label>
        <div className="chips">{[25, 50, 100, 200].map((c) => <button key={c} className={`chip${coins === c ? ' chosen' : ''}`} onClick={() => setCoins(c)}>💎 {c}</button>)}</div>
        <p className="note">Top reward for a perfect score. Students need 80% to pass.</p>
        <button className="btn primary" disabled={!title.trim() || !passage.trim()} onClick={() => setStep(1)}>Next: questions</button>
      </main>
    );
  }
  return (
    <main className="screen">
      <ScreenBar title={`Question ${step} of ${drafts.length}`} onBack={() => setStep(step - 1)} />
      <label className="field plain"><span>Question</span><input value={q.prompt} maxLength={160} onChange={(e) => patch({ prompt: e.target.value })} /></label>
      <p className="hint">Tap the circle by the right answer</p>
      {q.choices.map((c, i) => (
        <div className="choice-edit" key={i}>
          <button className={`radio${q.correct === i ? ' on' : ''}`} onClick={() => patch({ correct: i })} aria-label={`Choice ${i + 1} is correct`} />
          <input value={c} maxLength={80} placeholder={i < 2 ? 'Answer' : 'Answer (optional)'} onChange={(e) => patch({ choices: q.choices.map((x, j) => (j === i ? e.target.value : x)) })} />
        </div>
      ))}
      <label className="field plain"><span>Why is it right? (kids see this)</span><input value={q.why} maxLength={200} onChange={(e) => patch({ why: e.target.value })} /></label>
      <p className="error" role="alert">{error}</p>
      <div className="grow" />
      <div className="stack row">
        {step < drafts.length
          ? <button className="btn ghost" disabled={!filled(q)} onClick={() => setStep(step + 1)}>Next question</button>
          : <button className="btn ghost" disabled={!filled(q) || drafts.length >= MAX_Q} onClick={() => { setDrafts([...drafts, blank()]); setStep(step + 1); }}>＋ Add question</button>}
        <button className="btn primary" disabled={!ready} onClick={send}>Send ({drafts.length})</button>
      </div>
      <p className="note">Needs at least {MIN_Q} questions, up to {MAX_Q}.</p>
    </main>
  );
}
