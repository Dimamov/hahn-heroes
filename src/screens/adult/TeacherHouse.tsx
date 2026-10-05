import { useEffect, useState } from 'react';
import { HOUSE_COLORS, HOUSE_POWERS, type Backend, type ClassInfo, type HouseIdentity, type HouseTeacherView } from '../../lib/backend.ts';
import { ScreenBar } from '../../components/ScreenBar.tsx';

const blank = (i: number): HouseIdentity => ({ name: '', color: HOUSE_COLORS[(i * 3) % HOUSE_COLORS.length], power: HOUSE_POWERS[(i * 3) % HOUSE_POWERS.length].id, motto: '' });
const icon = (id: string) => HOUSE_POWERS.find((p) => p.id === id)?.icon ?? '🏰';
const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : '';
  if (m.includes('2 to 24 letters')) return 'House names use 2 to 24 letters.';
  if (m.includes('own name')) return 'Each House needs its own name.';
  if (m.includes('another class')) return 'Another class already has a House with that name.';
  if (m.includes('different words')) return 'Please pick different words.';
  if (m.includes('mottos')) return 'Mottos use letters, numbers and simple punctuation.';
  if (m.includes('at least one vote')) return 'Wait for at least one vote first.';
  return "That didn't work. Please try again.";
};

export function TeacherHouse({ backend, cls, onBack }: { backend: Backend; cls: ClassInfo; onBack: () => void }) {
  const [view, setView] = useState<HouseTeacherView | null>(null);
  const [drafts, setDrafts] = useState<HouseIdentity[] | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const load = () => backend.houseTeacherView(cls.id).then(setView).catch(() => setView({ state: 'none' }));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (fn: () => Promise<unknown>) => { setError(''); try { await fn(); setDrafts(null); } catch (e) { setError(errText(e)); } load(); };

  if (!view) return <main className="screen"><ScreenBar title="House" onBack={onBack} /><div className="spinner" /></main>;

  if (drafts) {
    const d = drafts[step];
    const patch = (p: Partial<HouseIdentity>) => setDrafts(drafts.map((x, i) => (i === step ? { ...x, ...p } : x)));
    const ok = (x: HouseIdentity) => x.name.trim().length >= 2;
    const last = step === drafts.length - 1;
    return (
      <main className="screen">
        <ScreenBar title={`House idea ${step + 1} of ${drafts.length}`} onBack={() => (step === 0 ? setDrafts(null) : setStep(step - 1))} />
        <label className="field plain"><span>Name</span><input value={d.name} maxLength={24} onChange={(e) => patch({ name: e.target.value })} placeholder="Ember Owls" /></label>
        <div className="chips" aria-label="Colour">
          {HOUSE_COLORS.map((c) => <button key={c} aria-label={c} className={`chip${d.color === c ? ' chosen' : ''}`} style={{ background: c, width: 36, height: 36, padding: 0 }} onClick={() => patch({ color: c })} />)}
        </div>
        <div className="chips" aria-label="Power">
          {HOUSE_POWERS.map((p) => <button key={p.id} className={`chip${d.power === p.id ? ' chosen' : ''}`} onClick={() => patch({ power: p.id })}>{p.icon} {p.label}</button>)}
        </div>
        <label className="field plain"><span>Motto (optional)</span><input value={d.motto} maxLength={40} onChange={(e) => patch({ motto: e.target.value })} placeholder="Bright minds burn brighter" /></label>
        <p className="error" role="alert">{error}</p>
        <div className="grow" />
        {last && drafts.length < 3 && <button className="btn ghost" disabled={!ok(d)} onClick={() => { setDrafts([...drafts, blank(drafts.length)]); setStep(step + 1); }}>＋ Add a third idea</button>}
        {!last && <button className="btn primary" disabled={!ok(d)} onClick={() => setStep(step + 1)}>Next idea</button>}
        {last && drafts.length >= 2 && <button className="btn primary" disabled={!drafts.every(ok)} onClick={() => run(() => backend.houseProposeOptions(cls.id, drafts.map((x) => ({ ...x, name: x.name.trim(), motto: x.motto.trim() }))))}>Start the class vote</button>}
      </main>
    );
  }

  return (
    <main className="screen">
      <ScreenBar title={`${cls.name} House`} onBack={onBack} />
      {view.state === 'active' && view.house && (
        <div className="card house-card" style={{ borderColor: view.house.color }}>
          <div className="house-crest" style={{ background: view.house.color }}>{icon(view.house.power)}</div>
          <b className="house-name">{view.house.name}</b>
          {view.house.motto && <p className="muted">“{view.house.motto}”</p>}
          <p className="muted">Your class chose this House.</p>
        </div>
      )}
      {view.state === 'none' && (
        <>
          <div className="card"><b>No House yet</b><p className="muted">Offer two or three ideas and your students vote. {view.members ?? 0} students have joined so far. A House shows on the leaderboard once it has 3 classmates.</p></div>
          <div className="grow" />
          <button className="btn primary" onClick={() => { setDrafts([blank(0), blank(1)]); setStep(0); }}>Propose House ideas</button>
        </>
      )}
      {view.state === 'voting' && view.options && (
        <>
          <p className="note">{view.voted} of {view.members} students have voted.</p>
          {view.options.map((o) => (
            <div className="card rank-row" key={o.id} style={{ borderColor: o.color }}>
              <span className="house-crest small" style={{ background: o.color }}>{icon(o.power)}</span>
              <span className="grow"><b>{o.name}</b>{o.motto && <small className="muted"> “{o.motto}”</small>}</span>
              <b>{o.votes}</b>
            </div>
          ))}
          <p className="error" role="alert">{error}</p>
          <div className="grow" />
          <button className="btn primary" disabled={!view.voted} onClick={() => run(() => backend.houseCloseVote(cls.id))}>Close the vote</button>
        </>
      )}
    </main>
  );
}
