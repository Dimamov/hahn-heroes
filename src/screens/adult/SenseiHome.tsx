import { useEffect, useState } from 'react';
import type { Adult, Backend, PendingTeacher, SenseiOverview } from '../../lib/backend.ts';
import { ScreenBar } from '../../components/ScreenBar.tsx';
import { PagedList } from '../../components/PagedList.tsx';

type View = 'home' | 'teachers' | 'announce' | 'trivia';
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const cap = (d: string) => d.charAt(0).toUpperCase() + d.slice(1, 3);

export function SenseiHome({ backend, adult, onSignOut }: { backend: Backend; adult: Adult; onSignOut: () => void }) {
  const [view, setView] = useState<View>('home');
  const [overview, setOverview] = useState<SenseiOverview | null>(null);
  const reload = () => backend.senseiOverview().then(setOverview).catch(() => {});
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const back = () => { reload(); setView('home'); };

  if (view === 'teachers') return <Teachers backend={backend} onBack={back} />;
  if (view === 'announce') return <Announce backend={backend} onBack={back} />;
  if (view === 'trivia') return <Trivia backend={backend} current={overview?.triviaNight} onBack={back} />;

  return (
    <main className="screen">
      <ScreenBar title={`Sensei ${adult.displayName.split(' ')[0]}`} onBack={onSignOut} right={<button className="btn link" onClick={onSignOut}>Sign out</button>} />
      {!overview ? <div className="spinner" /> : (
        <div className="stat-grid">
          <div><b>{overview.heroes}</b><small>Heroes</small></div>
          <div><b>{overview.grade5} / {overview.grade6}</b><small>Grade 5 / 6</small></div>
          <div><b>{overview.parents}</b><small>Parents</small></div>
          <div><b>{overview.teachers}</b><small>Teachers</small></div>
          <div><b>{overview.classes}</b><small>Classes</small></div>
          <div><b>{cap(overview.triviaNight.weekday)} {overview.triviaNight.time}</b><small>Trivia Night</small></div>
        </div>
      )}
      <div className="grow" />
      <button className="btn" onClick={() => setView('teachers')}>Teachers to approve{overview && overview.pendingTeachers > 0 ? ` (${overview.pendingTeachers})` : ''}</button>
      <button className="btn" onClick={() => setView('announce')}>📣 Post an announcement</button>
      <button className="btn" onClick={() => setView('trivia')}>🎤 Trivia Night time</button>
    </main>
  );
}

function Teachers({ backend, onBack }: { backend: Backend; onBack: () => void }) {
  const [list, setList] = useState<PendingTeacher[] | null>(null);
  const load = () => backend.pendingTeachers().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const decide = async (t: PendingTeacher, ok: boolean) => { await backend.approveTeacher(t.id, ok).catch(() => {}); load(); };
  return (
    <main className="screen">
      <ScreenBar title="Teachers" onBack={onBack} />
      {list === null ? <div className="spinner" /> : (
        <PagedList items={list} perPage={3} empty="Nobody is waiting. New teachers show up here."
          render={(t) => (
            <div className="card" key={t.id}>
              <div className="card-top"><b>{t.displayName}</b></div>
              <small className="muted">{t.email}</small>
              <div className="card-bottom"><span />
                <span className="row">
                  <button className="btn small ghost" onClick={() => decide(t, false)}>Decline</button>
                  <button className="btn small primary" onClick={() => decide(t, true)}>Approve</button>
                </span>
              </div>
            </div>
          )} />
      )}
    </main>
  );
}

function Announce({ backend, onBack }: { backend: Backend; onBack: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const send = async () => { try { await backend.postAnnouncement(title.trim(), body.trim()); setSent(true); } catch { setError("Couldn't post that. Please try again."); } };
  if (sent) {
    return (
      <main className="screen center"><div className="grow" /><div className="soon-icon" aria-hidden>📣</div><h3>Posted!</h3>
        <p className="hint">Every hero will see it next time they open the app.</p><div className="grow" />
        <button className="btn primary" onClick={onBack}>Done</button></main>
    );
  }
  return (
    <main className="screen">
      <ScreenBar title="Announcement" onBack={onBack} />
      <label className="field plain"><span>Title</span><input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="field plain grow-field"><span>Message</span><textarea value={body} maxLength={400} onChange={(e) => setBody(e.target.value)} /></label>
      <p className="error" role="alert">{error}</p>
      <button className="btn primary" disabled={!title.trim() || !body.trim()} onClick={send}>Post to all heroes</button>
    </main>
  );
}

function Trivia({ backend, current, onBack }: { backend: Backend; current?: { weekday: string; time: string }; onBack: () => void }) {
  const [day, setDay] = useState(current?.weekday ?? 'thursday');
  const [time, setTime] = useState(current?.time ?? '18:30');
  const [error, setError] = useState('');
  const save = async () => { try { await backend.setTriviaNight(day, time); onBack(); } catch { setError("Couldn't save that time."); } };
  return (
    <main className="screen">
      <ScreenBar title="Trivia Night" onBack={onBack} />
      <p className="hint">Pick the day heroes meet for Trivia Night.</p>
      <div className="chips">{DAYS.map((d) => <button key={d} className={`chip${day === d ? ' chosen' : ''}`} onClick={() => setDay(d)}>{cap(d)}</button>)}</div>
      <label className="field plain"><span>Start time</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      <p className="error" role="alert">{error}</p>
      <div className="grow" />
      <button className="btn primary" disabled={!time} onClick={save}>Save</button>
    </main>
  );
}
