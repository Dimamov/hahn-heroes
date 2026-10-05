import { useEffect, useState } from 'react';
import type { Adult, Backend, ChatRequest, DrawingReport, PendingTeacher, SenseiOverview, SenseiTraffic } from '../../lib/backend.ts';
import { ScreenBar } from '../../components/ScreenBar.tsx';
import { PagedList } from '../../components/PagedList.tsx';

type View = 'home' | 'teachers' | 'announce' | 'trivia' | 'traffic' | 'chat' | 'drawings';
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
  if (view === 'drawings') return <DrawingReports backend={backend} onBack={back} />;
  if (view === 'chat') return <ChatUnlocks backend={backend} onBack={back} />;
  if (view === 'traffic') return <Traffic backend={backend} onBack={back} />;
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
      <button className="btn" onClick={() => setView('chat')}>💬 Chat unlocks</button>
      <button className="btn" onClick={() => setView('drawings')}>🚩 Drawing reports</button>
      <button className="btn" onClick={() => setView('traffic')}>📈 Players and traffic</button>
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

const SCREEN_NAMES: Record<string, string> = {
  home: 'The Nexus', learn: 'Learn', missions: 'Missions', 'missions-home': 'Home missions', 'missions-class': 'Class missions',
  profile: 'Profile', announcements: 'Announcements', parentcode: 'Parent code', arcade: 'Arcade', adventures: 'Adventures',
  hero: 'My Hero', room: 'My Room', nexlings: 'Nexlings', cards: 'Cards', squad: 'Squad', settings: 'Settings', guide: 'Guide',
};
const screenName = (s: string) => SCREEN_NAMES[s] ?? (s.startsWith('practice:') ? `Practice ${s.slice(9)}` : s.startsWith('quiz:') ? 'Class quiz' : s);
const ago = (sec: number) => (sec < 60 ? 'just now' : `${Math.round(sec / 60)} min ago`);
const dayLabel = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;

function Bars({ items, label }: { items: { key: string; value: number; label: string }[]; label: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="bars" role="img" aria-label={label}>
      {items.map((i) => (
        <div className="bar-col" key={i.key} title={`${i.label}: ${i.value}`}>
          <span className="bar-n">{i.value || ''}</span>
          <span className="tbar" style={{ height: `${Math.max(i.value ? 8 : 2, (i.value / max) * 100)}%` }} />
          <small>{i.label}</small>
        </div>
      ))}
    </div>
  );
}

function Traffic({ backend, onBack }: { backend: Backend; onBack: () => void }) {
  const [t, setT] = useState<SenseiTraffic | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<'now' | 'days' | 'hours'>('now');
  const load = () => backend.senseiTraffic().then((d) => { setT(d); setFailed(false); }).catch(() => setFailed(true));
  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main className="screen">
      <ScreenBar title="Traffic" onBack={onBack} />
      {!t ? (failed ? <p className="error" role="alert">Couldn't load the numbers.</p> : <div className="spinner" />) : (
        <>
          <div className="stat-grid">
            <div><b>{t.nowHeroes}</b><small>Heroes online now</small></div>
            <div><b>{t.todayHeroes}</b><small>Heroes today</small></div>
            <div><b>{t.weekHeroes}</b><small>Last 7 days</small></div>
            <div><b>{t.monthHeroes}</b><small>Last 30 days</small></div>
            <div><b>{t.totalHeroes}</b><small>Signed up</small></div>
            <div><b>{t.nowAdults}</b><small>Grown-ups now</small></div>
          </div>
          <div className="chips">
            <button className={`chip${tab === 'now' ? ' chosen' : ''}`} onClick={() => setTab('now')}>Online now</button>
            <button className={`chip${tab === 'days' ? ' chosen' : ''}`} onClick={() => setTab('days')}>14 days</button>
            <button className={`chip${tab === 'hours' ? ' chosen' : ''}`} onClick={() => setTab('hours')}>Today</button>
          </div>
          {tab === 'now' && (
            <PagedList items={t.active} perPage={4} empty="Nobody is on right now."
              render={(a) => (
                <div className="card" key={`${a.name}-${a.screen}`}>
                  <div className="card-top"><b>{a.name}</b><small className="muted">Grade {a.grade}</small></div>
                  <small className="muted">{screenName(a.screen)} · {ago(a.secondsAgo)}</small>
                </div>
              )} />
          )}
          {tab === 'days' && (
            <>
              <Bars label="Heroes per day, last 14 days" items={t.days.map((d) => ({ key: d.day, value: d.heroes, label: dayLabel(d.day) }))} />
              <p className="hint">Heroes who opened the app each day. Today: {t.days[t.days.length - 1]?.minutes ?? 0} minutes played, {t.days[t.days.length - 1]?.adults ?? 0} grown-ups.</p>
            </>
          )}
          {tab === 'hours' && (
            <>
              <Bars label="Heroes per hour today" items={t.hours.filter((h) => h.hour >= 6 && h.hour <= 22).map((h) => ({ key: String(h.hour), value: h.heroes, label: hourLabel(h.hour) }))} />
              <p className="hint">Heroes online in each hour today, school time.{t.screens.length ? ` Busiest screen now: ${screenName(t.screens[0].screen)}.` : ''}</p>
            </>
          )}
        </>
      )}
      <div className="grow" />
    </main>
  );
}

function DrawingReports({ backend, onBack }: { backend: Backend; onBack: () => void }) {
  const [list, setList] = useState<DrawingReport[] | null>(null);
  useEffect(() => { backend.senseiDrawingReports().then(setList).catch(() => setList([])); }, [backend]);
  return (
    <main className="screen">
      <ScreenBar title="Drawing reports" onBack={onBack} />
      <p className="hint">Drawings that heroes reported in Squad Drawing. Two reports end a drawing right away. Nothing is saved from the drawing itself.</p>
      {list === null ? <div className="spinner" /> : (
        <PagedList items={list} perPage={3} empty="No reports. Everything looks good!"
          render={(r) => (
            <div className="card" key={`${r.at}-${r.reporter}`}>
              <div className="card-top"><b>{r.artist}</b><small className="muted">{new Date(r.at).toLocaleString()}</small></div>
              <small className="muted">The word was “{r.word}”. Reported by {r.reporter}.</small>
            </div>
          )} />
      )}
    </main>
  );
}

function ChatUnlocks({ backend, onBack }: { backend: Backend; onBack: () => void }) {
  const [list, setList] = useState<ChatRequest[] | null>(null);
  const load = () => backend.senseiChatRequests().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const unlock = async (r: ChatRequest) => { await backend.chatUnlock(r.childId).catch(() => {}); load(); };
  return (
    <main className="screen">
      <ScreenBar title="Chat unlocks" onBack={onBack} />
      <p className="hint">Heroes whose chat is paused. Parents can ask for an unlock.</p>
      {list === null ? <div className="spinner" /> : (
        <PagedList items={list} perPage={3} empty="Nobody's chat is paused."
          render={(r) => (
            <div className="card" key={r.childId}>
              <div className="card-top"><b>{r.name}</b><small className="muted">Grade {r.grade}</small></div>
              <small className="muted">{r.requested ? 'A parent asked for an unlock' : 'No request yet'}</small>
              <div className="card-bottom"><span />
                <button className="btn small primary" onClick={() => unlock(r)}>Unlock chat</button>
              </div>
            </div>
          )} />
      )}
    </main>
  );
}
