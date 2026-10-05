import { useEffect, useState } from 'react';
import { ItemGrid } from '../../components/ItemGrid.tsx';
import { CardFace } from '../../components/CardFace.tsx';
import { CARDS } from '../../lib/cards.ts';
import { SECRET_PLACES, type Adult, type Announcement, type Backend, type CharacterRequest, type SenseiSecret, ChatLogLine, ChatRequest, DrawingReport, PendingTeacher, SenseiChallenge, SenseiEvent, SenseiOverview, SenseiTraffic, TriviaRoster } from '../../lib/backend.ts';
import { ScreenBar } from '../../components/ScreenBar.tsx';
import { shrinkImage } from '../../lib/image-file.ts';
import { UsageReportScreen } from './UsageReport.tsx';
import { KindReview } from './KindReview.tsx';
import { CodeMaker } from './CodeMaker.tsx';
import { PagedList } from '../../components/PagedList.tsx';

type View = 'home' | 'challenge' | 'events' | 'delete' | 'card' | 'teachers' | 'announce' | 'trivia' | 'traffic' | 'chat' | 'drawings' | 'characters' | 'secret' | 'codes' | 'kind' | 'usage';
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
  if (view === 'codes') return <CodeMaker backend={backend} onBack={back} />;
  if (view === 'usage') return <UsageReportScreen backend={backend} onBack={back} />;
  if (view === 'kind') return <KindReview backend={backend} onBack={back} />;
  if (view === 'secret') return <SecretHunt backend={backend} onBack={back} />;
  if (view === 'characters') return <Characters backend={backend} onBack={back} />;
  if (view === 'card') return <GiveCard backend={backend} onBack={back} />;
  if (view === 'chat') return <ChatUnlocks backend={backend} onBack={back} />;
  if (view === 'traffic') return <Traffic backend={backend} onBack={back} />;
  if (view === 'challenge') return <Challenge backend={backend} onBack={back} />;
  if (view === 'delete') return <DeleteHero backend={backend} onBack={back} />;
  if (view === 'events') return <Events backend={backend} onBack={back} />;
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
      <div className="btn-grid">
        <button className="btn" onClick={() => setView('characters')}>🧙 Teacher characters</button>
        <button className="btn" onClick={() => setView('secret')}>✨ Weekly secret</button>
        <button className="btn" onClick={() => setView('codes')}>🔑 Secret codes</button>
        <button className="btn" onClick={() => setView('kind')}>💛 Kindness</button>
        <button className="btn" onClick={() => setView('card')}>🎁 Give a card</button>
        <button className="btn" onClick={() => setView('chat')}>💬 Chat unlocks</button>
        <button className="btn" onClick={() => setView('drawings')}>🚩 Drawing reports</button>
        <button className="btn" onClick={() => setView('traffic')}>📈 Players and traffic</button>
        <button className="btn" onClick={() => setView('usage')}>🗓 Monthly report</button>
        <button className="btn" onClick={() => setView('teachers')}>Teachers to approve{overview && overview.pendingTeachers > 0 ? ` (${overview.pendingTeachers})` : ''}</button>
        <button className="btn" onClick={() => setView('announce')}>📣 Post an announcement</button>
        <button className="btn" onClick={() => setView('challenge')}>🏁 Weekly House challenge</button>
        <button className="btn" onClick={() => setView('events')}>🍂 Seasonal events</button>
        <button className="btn" onClick={() => setView('delete')}>🗑️ Delete a hero</button>
        <button className="btn" onClick={() => setView('trivia')}>🎤 Trivia Night time</button>
      </div>
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
  const [tab, setTab] = useState<'new' | 'old'>('new');
  const [old, setOld] = useState<Announcement[] | null>(null);
  const [removing, setRemoving] = useState<Announcement | null>(null);
  const loadOld = () => backend.announcements().then((a) => setOld(a.items)).catch(() => setOld([]));
  useEffect(() => { loadOld(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const remove = async (a: Announcement) => { setRemoving(null); try { await backend.senseiDeleteAnnouncement(a.id); } catch { setError("Couldn't remove that one."); } loadOld(); };
  if (sent) {
    return (
      <main className="screen center"><div className="grow" /><div className="soon-icon" aria-hidden>📣</div><h3>Posted!</h3>
        <p className="hint">Every hero will see it next time they open the app.</p><div className="grow" />
        <button className="btn primary" onClick={onBack}>Done</button></main>
    );
  }
  return (
    <main className="screen">
      <ScreenBar title="Announcements" onBack={onBack} />
      <div className="chips">
        <button className={`chip${tab === 'new' ? ' chosen' : ''}`} onClick={() => setTab('new')}>Post new</button>
        <button className={`chip${tab === 'old' ? ' chosen' : ''}`} onClick={() => setTab('old')}>Remove old</button>
      </div>
      {tab === 'new' ? (
        <>
          <label className="field plain"><span>Title</span><input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="field plain grow-field"><span>Message</span><textarea value={body} maxLength={400} onChange={(e) => setBody(e.target.value)} /></label>
          <p className="error" role="alert">{error}</p>
          <button className="btn primary" disabled={!title.trim() || !body.trim()} onClick={send}>Post to all heroes</button>
        </>
      ) : (
        <>
          {old === null ? <div className="spinner" /> : (
            <PagedList items={old} perPage={3} empty="No announcements."
              render={(a) => (
                <div className="card" key={a.id}>
                  <div className="card-top"><b>{a.title}</b><small className="muted">{new Date(a.createdAt).toLocaleDateString()}</small></div>
                  <div className="card-bottom"><span />
                    <button className="btn small ghost" onClick={() => setRemoving(a)}>Remove</button>
                  </div>
                </div>
              )} />
          )}
          <p className="error" role="alert">{error}</p>
        </>
      )}
      {removing && (
        <div className="opicker" role="dialog" aria-label="Remove this announcement">
          <div className="card">
            <b>Remove “{removing.title}”?</b>
            <p className="muted">Heroes will no longer see it.</p>
            <div className="seg"><button onClick={() => setRemoving(null)}>Keep</button><button className="chosen" onClick={() => remove(removing)}>Remove</button></div>
          </div>
        </div>
      )}
    </main>
  );
}

function GiveCard({ backend, onBack }: { backend: Backend; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const send = async () => {
    try { const name = await backend.senseiGiveCard(code.trim(), pick!); setNote(`Sent to ${name}! 🎉`); setPick(null); } catch { setNote('No hero has that code, or the card could not be sent.'); }
  };
  const rarer = [...CARDS].reverse();
  return (
    <main className="screen">
      <ScreenBar title="Give a card" onBack={onBack} />
      <label className="field plain"><span>Hero code</span><input value={code} maxLength={8} onChange={(e) => setCode(e.target.value.toUpperCase())} /></label>
      <ItemGrid items={rarer} empty="" render={(c) => <CardFace key={c.id} id={c.id} small selected={pick === c.id} onClick={() => setPick(c.id)} />} />
      <p className="note" role="status">{note}</p>
      <button className="btn primary" disabled={code.trim().length < 8 || !pick} onClick={send}>Send the card</button>
    </main>
  );
}

function Challenge({ backend, onBack }: { backend: Backend; onBack: () => void }) {
  const [view, setView] = useState<SenseiChallenge | null>(null);
  const [theme, setTheme] = useState('');
  const [goal, setGoal] = useState(20);
  const [coins, setCoins] = useState(15);
  const [note, setNote] = useState('');
  const load = () => backend.senseiChallenge().then((c) => { setView(c); if (c.theme) { setTheme(c.theme); setGoal(c.goal ?? 20); setCoins(c.coins ?? 15); } }).catch(() => undefined);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => { try { await backend.senseiSetChallenge(theme, goal, coins); setNote('Saved for this week! 🏁'); load(); } catch { setNote('Check the theme (3 to 40 letters), goal (5 to 80) and reward (5 to 50).'); } };
  return (
    <main className="screen">
      <ScreenBar title="House challenge" onBack={onBack} />
      <p className="hint">Pick this week's theme and how many points per hero a House needs to reach.</p>
      <label className="field plain"><span>Theme</span><input value={theme} maxLength={40} onChange={(e) => setTheme(e.target.value)} placeholder="Reading Week" /></label>
      <div className="row2">
        <label className="field plain"><span>Goal per hero</span><input type="number" min={5} max={80} value={goal} onChange={(e) => setGoal(Number(e.target.value))} /></label>
        <label className="field plain"><span>Reward points</span><input type="number" min={5} max={50} value={coins} onChange={(e) => setCoins(Number(e.target.value))} /></label>
      </div>
      {view && view.houses.length > 0 && <small className="muted">{view.houses.slice(0, 4).map((h) => `${h.name} ${h.progress}`).join(' · ')}</small>}
      <p className="note" role="status">{note}</p>
      <div className="grow" />
      <button className="btn primary" disabled={theme.trim().length < 3} onClick={save}>Save this week's challenge</button>
    </main>
  );
}

function DeleteHero({ backend, onBack }: { backend: Backend; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const go = async () => {
    setAsking(false);
    try { const name = await backend.senseiDeleteHero(code); setNote(`${name} and all their data were deleted.`); setCode(''); } catch { setNote('No hero has that code.'); }
  };
  return (
    <main className="screen">
      <ScreenBar title="Delete a hero" onBack={onBack} />
      <p className="hint">For a parent or school request. Type the hero's sign-in code from their card. This removes the hero and everything they earned, and cannot be undone.</p>
      <label className="field plain"><span>Hero code</span><input value={code} maxLength={9} autoCapitalize="characters" onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD-EFGH" /></label>
      <p className="note" role="status">{note}</p>
      <div className="grow" />
      <button className="btn primary" disabled={code.replace(/[^A-Z0-9]/g, '').length !== 8} onClick={() => setAsking(true)}>Delete this hero</button>
      {asking && (
        <div className="opicker" role="dialog" aria-label="Delete this hero">
          <div className="card">
            <b>Delete this hero forever?</b>
            <p className="muted">Code {code}. All their points, cards and progress go with them.</p>
            <div className="seg"><button onClick={() => setAsking(false)}>Keep</button><button className="chosen" onClick={go}>Delete</button></div>
          </div>
        </div>
      )}
    </main>
  );
}

function Events({ backend, onBack }: { backend: Backend; onBack: () => void }) {
  const [list, setList] = useState<SenseiEvent[] | null>(null);
  const [note, setNote] = useState('');
  const load = () => backend.senseiEvents().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (id: string, patch: Partial<SenseiEvent>) => setList((l) => l && l.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const save = async (e: SenseiEvent) => {
    try { await backend.senseiSetEvent(e.id, e.starts, e.ends, e.enabled); setNote(`${e.name} saved! ✅`); } catch { setNote('The end date must be after the start, and 90 days at most.'); }
    load();
  };
  return (
    <main className="screen">
      <ScreenBar title="Seasonal events" onBack={onBack} />
      <p className="hint">Limited items go on sale in the Shop only between these dates. Heroes keep what they bought.</p>
      <PagedList items={list ?? []} perPage={1} empty={list ? 'No events.' : ''} render={(e) => (
        <div className="card" key={e.id}>
          <b>{e.icon} {e.name}</b><small className="muted">{e.items} limited items</small>
          <div className="row2">
            <label className="field plain"><span>Starts</span><input type="date" value={e.starts} onChange={(x) => edit(e.id, { starts: x.target.value })} /></label>
            <label className="field plain"><span>Ends</span><input type="date" value={e.ends} onChange={(x) => edit(e.id, { ends: x.target.value })} /></label>
          </div>
          <div className="seg">
            <button className={e.enabled ? 'chosen' : ''} onClick={() => edit(e.id, { enabled: true })}>On</button>
            <button className={!e.enabled ? 'chosen' : ''} onClick={() => edit(e.id, { enabled: false })}>Off</button>
          </div>
          <button className="btn primary" onClick={() => save(e)}>Save {e.name}</button>
        </div>
      )} />
      <p className="note" role="status">{note}</p>
    </main>
  );
}

function Trivia({ backend, current, onBack }: { backend: Backend; current?: { weekday: string; time: string }; onBack: () => void }) {
  const [day, setDay] = useState(current?.weekday ?? 'thursday');
  const [time, setTime] = useState(current?.time ?? '18:30');
  const [error, setError] = useState('');
  const [roster, setRoster] = useState<TriviaRoster | null>(null);
  const [prize, setPrize] = useState(10);
  useEffect(() => { backend.senseiTriviaRoster().then(setRoster).catch(() => undefined); }, [backend]);
  const save = async () => { try { await backend.setTriviaNight(day, time); onBack(); } catch { setError("Couldn't save that time."); } };
  const give = async () => {
    try { const n = await backend.senseiTriviaPrize(prize); setError(n ? `Prize sent to ${n} hero${n === 1 ? '' : 'es'}! 🎉` : 'Everyone who is coming already has tonight\'s prize.'); } catch { setError("Couldn't send the prize."); }
  };
  return (
    <main className="screen">
      <ScreenBar title="Trivia Night" onBack={onBack} />
      <p className="hint">Pick the day heroes meet for Trivia Night.</p>
      <div className="chips">{DAYS.map((d) => <button key={d} className={`chip${day === d ? ' chosen' : ''}`} onClick={() => setDay(d)}>{cap(d)}</button>)}</div>
      <label className="field plain"><span>Start time</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      {roster && (
        <div className="card">
          <b>Coming on {roster.date}</b>
          {roster.grades.length === 0 ? <small className="muted">No RSVPs yet.</small>
            : roster.grades.map((g) => <small key={g.grade}>Grade {g.grade}: {g.going} ({g.names.slice(0, 6).join(', ')}{g.names.length > 6 ? '…' : ''})</small>)}
          <label className="field plain"><span>Prize points each (tonight only)</span><input type="number" min={1} max={100} value={prize} onChange={(e) => setPrize(Number(e.target.value))} /></label>
          <button className="btn" onClick={give}>Give the prize to everyone who came</button>
        </div>
      )}
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
  const [log, setLog] = useState<{ name: string; lines: ChatLogLine[] } | null>(null);
  const read = async (r: ChatRequest) => setLog({ name: r.name, lines: await backend.senseiChatLog(r.childId).catch(() => []) });
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
              <div className="card-bottom">
                <button className="btn small ghost" onClick={() => read(r)}>Read recent chat</button>
                <button className="btn small primary" onClick={() => unlock(r)}>Unlock chat</button>
              </div>
            </div>
          )} />
      )}
      {log && (
        <div className="opicker" role="dialog" aria-label="Recent chat">
          <div className="card">
            <b>Recent chat near {log.name}</b>
            <div className="chat-list">
              {log.lines.length === 0 && <small className="muted">No messages saved.</small>}
              {log.lines.map((l, k) => <div key={k} className={`chat-msg${l.child ? ' me' : ''}`}><small>{l.name}</small><span>{l.body}</span></div>)}
            </div>
            <small className="muted">A blocked message itself is never saved.</small>
            <button className="btn small primary" onClick={() => setLog(null)}>Close</button>
          </div>
        </div>
      )}
    </main>
  );
}

/** Teacher photo requests: look at the photo and wish list, make the art elsewhere, upload it for the teacher to approve. */
function Characters({ backend, onBack }: { backend: Backend; onBack: () => void }) {
  const [list, setList] = useState<CharacterRequest[] | null>(null);
  const [art, setArt] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const load = () => backend.senseiCharacterQueue().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = async (id: string, f: File | undefined) => {
    if (!f) return;
    setError('');
    try { const a = await shrinkImage(f, 1100, 'image/jpeg'); setArt({ ...art, [id]: a }); } catch { setError('That file is not a picture.'); }
  };
  const send = async (r: CharacterRequest) => {
    setError('');
    try { await backend.senseiCharacterDeliver(r.teacherId, art[r.teacherId], note[r.teacherId] ?? ''); load(); }
    catch { setError("Couldn't send that. Try a smaller image."); }
  };
  return (
    <main className="screen">
      <ScreenBar title="Teacher characters" onBack={onBack} />
      <p className="error" role="alert">{error}</p>
      {list === null ? <div className="spinner" /> : (
        <PagedList items={list} perPage={1} empty="No character requests waiting."
          render={(r) => (
            <div className="card" key={r.teacherId}>
              <div className="card-top"><b>{r.name}</b><span className="reward">{r.status === 'changes' ? 'Changes asked' : 'New'}</span></div>
              {r.photo ? <img className="char-photo" src={r.photo} alt={`Photo from ${r.name}`} /> : <p className="muted">Photo removed.</p>}
              {r.wish && <p><b>Wish list (a request):</b> {r.wish}</p>}
              {r.changeNote && <p><b>Asked to change:</b> {r.changeNote}</p>}
              <input type="file" accept="image/*" onChange={(e) => pick(r.teacherId, e.target.files?.[0])} aria-label="Upload the finished art" />
              <label className="field plain"><span>Note for the teacher (optional)</span>
                <input value={note[r.teacherId] ?? ''} maxLength={300} onChange={(e) => setNote({ ...note, [r.teacherId]: e.target.value })} /></label>
              <button className="btn small primary" disabled={!art[r.teacherId]} onClick={() => send(r)}>Send for approval</button>
            </div>
          )} />
      )}
    </main>
  );
}

/** Choose where this week's sparkle hides, the hint and the card prize (until someone finds it). */
function SecretHunt({ backend, onBack }: { backend: Backend; onBack: () => void }) {
  const [cur, setCur] = useState<SenseiSecret | null>(null);
  const [place, setPlace] = useState('');
  const [hint, setHint] = useState('');
  const [card, setCard] = useState('');
  const [note, setNote] = useState('');
  const load = () => backend.senseiSecret().then((c) => { setCur(c); setPlace(c.place); setHint(c.hint); setCard(c.card); }).catch(() => undefined);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => { try { await backend.senseiSecretSet(place, hint, card); setNote('Saved for this week! ✨'); load(); } catch { setNote('It cannot change once a hero has found it.'); } };
  return (
    <main className="screen">
      <ScreenBar title="Weekly secret" onBack={onBack} />
      {!cur ? <div className="spinner" /> : (
        <>
          <p className="hint">{cur.finders} found it{cur.winnerSquad ? ` · first squad: ${cur.winnerSquad}` : ''}. Pick the screen where the sparkle hides.</p>
          <div className="chips">{SECRET_PLACES.map((p) => <button key={p} className={`chip${place === p ? ' chosen' : ''}`} onClick={() => setPlace(p)}>{p}</button>)}</div>
          <label className="field plain"><span>Hint (blank for the standard one)</span><input value={hint} maxLength={120} onChange={(e) => setHint(e.target.value)} /></label>
          <label className="field plain"><span>Card prize</span>
            <select value={card} onChange={(e) => setCard(e.target.value)}>{CARDS.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name} ({c.rarity})</option>)}</select></label>
          <p className="note" role="status">{note}</p>
          <div className="grow" />
          <button className="btn primary" disabled={cur.finders > 0} onClick={save}>Save</button>
        </>
      )}
    </main>
  );
}
