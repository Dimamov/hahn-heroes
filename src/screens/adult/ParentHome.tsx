import { useEffect, useState } from 'react';
import type { Adult, Backend, ChildProgress, ChildSummary, HomeMission, SubjectProgress } from '../../lib/backend.ts';
import { SUBJECT_INFO } from '../Learn.tsx';
import { ScreenBar } from '../../components/ScreenBar.tsx';
import { PagedList } from '../../components/PagedList.tsx';
import { HeroArt } from '../../components/HeroArt.tsx';
import { formatHeroCode, normalizeHeroCode } from '../../../supabase/functions/_shared/kid-auth.ts';

type View = { name: 'list' } | { name: 'link' } | { name: 'child'; child: ChildSummary } | { name: 'new'; child: ChildSummary } | { name: 'learning'; child: ChildSummary };

const LINK_ERRORS = { invalid_code: "That code isn't right, or it was already used. Ask your child for a new one.", too_many_tries: 'Too many tries. Please wait an hour and try again.' };

export function ParentHome({ backend, adult, onSignOut, onPrivacy }: { backend: Backend; adult: Adult; onSignOut: () => void; onPrivacy?: () => void }) {
  const [view, setView] = useState<View>(new URLSearchParams(window.location.search).has('link') ? { name: 'link' } : { name: 'list' });
  const [children, setChildren] = useState<ChildSummary[] | null>(null);
  const reload = () => backend.children().then(setChildren).catch(() => setChildren([]));
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (view.name === 'link') return <LinkChild backend={backend} onBack={() => { reload(); setView({ name: 'list' }); }} />;
  if (view.name === 'new') return <NewMission backend={backend} child={view.child} onBack={() => setView({ name: 'child', child: view.child })} />;
  if (view.name === 'learning') return <LearningView backend={backend} child={view.child} onBack={() => setView({ name: 'child', child: view.child })} />;
  if (view.name === 'child') return <ChildScreen backend={backend} child={view.child} onBack={() => { reload(); setView({ name: 'list' }); }} onNew={() => setView({ name: 'new', child: view.child })} onLearning={() => setView({ name: 'learning', child: view.child })} />;

  return (
    <main className="screen">
      <ScreenBar title={`Hi ${adult.displayName.split(' ')[0]}`} onBack={onSignOut} right={<><button className="btn link" onClick={onPrivacy}>Privacy</button><button className="btn link" onClick={onSignOut}>Sign out</button></>} />
      {children === null ? <div className="spinner" /> : (
        <PagedList
          items={children}
          perPage={3}
          empty="No children linked yet. Ask your child to open their profile, tap Grown-up code, and type it here."
          render={(c) => (
            <button className="card child clickable" key={c.id} onClick={() => setView({ name: 'child', child: c })}>
              <HeroArt id={c.starter} className="child-art" />
              <div><b>{c.displayName}</b><small>Grade {c.grade}</small></div>
              {c.waiting > 0 && <span className="waiting">{c.waiting} to check</span>}
            </button>
          )}
        />
      )}
      <button className="btn primary" onClick={() => setView({ name: 'link' })}>＋ Link a child</button>
    </main>
  );
}

function LinkChild({ backend, onBack }: { backend: Backend; onBack: () => void }) {
  const [code, setCode] = useState(normalizeHeroCode(new URLSearchParams(window.location.search).get('link') ?? '').slice(0, 8));
  const [error, setError] = useState('');
  const [linked, setLinked] = useState('');
  const submit = async () => {
    const r = await backend.claimLink(code).catch(() => ({ ok: false as const, error: 'invalid_code' as const }));
    if (r.ok) setLinked(r.childName); else setError(LINK_ERRORS[r.error]);
  };
  if (linked) {
    return (
      <main className="screen center">
        <div className="grow" /><div className="soon-icon" aria-hidden>🎉</div>
        <h3>You're linked to {linked}!</h3>
        <p className="hint">You can now send home missions and see their progress.</p>
        <div className="grow" /><button className="btn primary" onClick={onBack}>Done</button>
      </main>
    );
  }
  return (
    <main className="screen">
      <ScreenBar title="Link your child" onBack={onBack} />
      <p className="hint">Ask your child to open their profile and tap "Grown-up code". Type it here.</p>
      <label className="field"><input autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="ABCD-EFGH"
        value={formatHeroCode(code)} onChange={(e) => setCode(normalizeHeroCode(e.target.value).slice(0, 8))} /></label>
      <p className="error" role="alert">{error}</p>
      <div className="grow" />
      <button className="btn primary" disabled={code.length !== 8} onClick={submit}>Link</button>
    </main>
  );
}

const STATUS: Record<HomeMission['status'], string> = { assigned: 'Not done yet', submitted: 'Needs your check', approved: 'Approved', sent_back: 'Sent back' };

function ChatNotice({ backend, child }: { backend: Backend; child: ChildSummary }) {
  const [st, setSt] = useState<{ banned: boolean; requested: boolean } | null>(null);
  useEffect(() => { backend.childChat(child.id).then(setSt).catch(() => setSt(null)); }, [backend, child.id]);
  if (!st?.banned) return null;
  return (
    <div className="card" role="status">
      <b>💬 Chat is paused for {child.displayName}</b>
      <small className="muted">A message broke the chat rules twice. Games still work.</small>
      <div className="card-bottom"><span />
        {st.requested
          ? <small className="muted">Asked the Sensei to unlock it</small>
          : <button className="btn small primary" onClick={async () => { await backend.chatRequestUnlock(child.id).catch(() => undefined); setSt({ banned: true, requested: true }); }}>Ask the Sensei to unlock</button>}
      </div>
    </div>
  );
}

function ChildScreen({ backend, child, onBack, onNew, onLearning }: { backend: Backend; child: ChildSummary; onBack: () => void; onNew: () => void; onLearning: () => void }) {
  const [missions, setMissions] = useState<HomeMission[] | null>(null);
  const [progress, setProgress] = useState<ChildProgress | null>(null);
  const [note, setNote] = useState('');
  const load = async () => {
    setMissions(await backend.childMissions(child.id).catch(() => []));
    setProgress(await backend.childProgress(child.id).catch(() => null));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const review = async (m: HomeMission, approve: boolean) => {
    try {
      const r = await backend.reviewHomeMission(m.id, approve);
      setNote(!approve ? 'Sent back to try again.' : r.capped ? `Approved. ${r.awarded} 💎 added; the weekly limit was reached.` : `Approved! ${r.awarded} 💎 added.`);
    } catch { setNote("That one can't be changed right now."); }
    await load();
  };
  // Waiting ones first, so they are on the first page.
  const ordered = [...(missions ?? [])].sort((a, b) => Number(b.status === 'submitted') - Number(a.status === 'submitted'));

  return (
    <main className="screen">
      <ScreenBar title={child.displayName} onBack={onBack} />
      {progress && (
        <div className="progress-card">
          <div><b>💎 {progress.coins}</b><small>Nexus points</small></div>
          <div><b>🏠 {progress.homeWeek}/{progress.homeCap}</b><small>Home this week</small></div>
          <div><b>🏫 {progress.classWeek}/{progress.classCap}</b><small>Class this week</small></div>
        </div>
      )}
      <ChatNotice backend={backend} child={child} />
      {note && <p className="note ok" role="status">{note}</p>}
      {missions === null ? <div className="spinner" /> : (
        <PagedList items={ordered} perPage={2} empty="No missions yet. Tap New mission to send one."
          render={(m) => (
            <div className={`card mission ${m.status}`} key={m.id}>
              <div className="card-top"><b>{m.title}</b><span className="reward">💎 {m.coins}</span></div>
              <div className="card-bottom">
                <span className="chip-status">{STATUS[m.status]}</span>
                {m.status === 'submitted' && (
                  <span className="row">
                    <button className="btn small ghost" onClick={() => review(m, false)}>Not yet</button>
                    <button className="btn small primary" onClick={() => review(m, true)}>Approve</button>
                  </span>
                )}
              </div>
            </div>
          )} />
      )}
      <div className="stack row">
        <button className="btn ghost" onClick={onLearning}>📈 Learning</button>
        <button className="btn primary" onClick={onNew}>＋ New mission</button>
      </div>
    </main>
  );
}

/** How a child is doing in each subject, with the skills that need more practice. */
function LearningView({ backend, child, onBack }: { backend: Backend; child: ChildSummary; onBack: () => void }) {
  const [data, setData] = useState<SubjectProgress[] | null>(null);
  useEffect(() => { backend.childLearning(child.id).then(setData).catch(() => setData([])); }, [backend, child.id]);
  const pct = (c: number, a: number) => (a ? Math.round((100 * c) / a) : 0);
  const weak = (data ?? []).flatMap((s) => s.skills.filter((k) => k.attempts >= 3 && pct(k.correct, k.attempts) < 60).map((k) => ({ subject: s.subject, ...k })));
  const strong = (data ?? []).flatMap((s) => s.skills.filter((k) => k.attempts >= 3 && pct(k.correct, k.attempts) >= 80).map((k) => ({ subject: s.subject, ...k })));
  const name = (k: { subject: SubjectProgress['subject']; skill: string }) => `${SUBJECT_INFO[k.subject].label}: ${k.skill.replace(/-/g, ' ')}`;
  return (
    <main className="screen">
      <ScreenBar title={`${child.displayName}: learning`} onBack={onBack} />
      {data === null ? <div className="spinner" /> : (
        <>
          <div className="progress-card learn">
            {data.map((s) => (
              <div key={s.subject}><b>{SUBJECT_INFO[s.subject].icon} {s.answered ? `${pct(s.correct, s.answered)}%` : '–'}</b><small>{SUBJECT_INFO[s.subject].label} · {s.answered} answered</small></div>
            ))}
          </div>
          <p className="hint">Needs more practice</p>
          {weak.length ? weak.slice(0, 3).map((k) => <div className="skill-row weak" key={name(k)}><span>{name(k)}</span><span>{pct(k.correct, k.attempts)}%</span></div>) : <p className="note">Nothing stands out yet. Skills show up after a few answers.</p>}
          <p className="hint">Going great</p>
          {strong.length ? strong.slice(0, 3).map((k) => <div className="skill-row" key={name(k)}><span>{name(k)}</span><span>{pct(k.correct, k.attempts)}%</span></div>) : <p className="note">Still gathering answers.</p>}
        </>
      )}
    </main>
  );
}

const COIN_CHOICES = [10, 25, 50, 100];

function NewMission({ backend, child, onBack }: { backend: Backend; child: ChildSummary; onBack: () => void }) {
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [coins, setCoins] = useState(25);
  const [error, setError] = useState('');
  const send = async () => {
    try { await backend.createHomeMission(child.id, title, details, coins); onBack(); } catch { setError("Couldn't send that mission. Please try again."); }
  };
  return (
    <main className="screen">
      <ScreenBar title={`Mission for ${child.displayName}`} onBack={onBack} />
      <label className="field plain"><span>What should they do?</span>
        <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Clean your room" /></label>
      <label className="field plain"><span>Details (optional)</span>
        <input value={details} maxLength={200} onChange={(e) => setDetails(e.target.value)} placeholder="Put toys in the bin and make the bed" /></label>
      <p className="hint">Reward</p>
      <div className="chips">{COIN_CHOICES.map((c) => <button key={c} className={`chip${coins === c ? ' chosen' : ''}`} onClick={() => setCoins(c)}>💎 {c}</button>)}</div>
      <p className="note">Your child earns up to 500 💎 a week from home missions.</p>
      <p className="error" role="alert">{error}</p>
      <div className="grow" />
      <button className="btn primary" disabled={!title.trim()} onClick={send}>Send mission</button>
    </main>
  );
}
