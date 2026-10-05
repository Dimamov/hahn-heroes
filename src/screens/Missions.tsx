import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { ReadAloud } from '../components/ReadAloud.tsx';
import { questionText } from '../lib/speak.ts';
import { PagedList } from '../components/PagedList.tsx';
import { Pager } from '../components/Pager.tsx';
import type { Announcement, ClassMission, ClassResult, HomeMission, JoinClassResult, TriviaState } from '../lib/backend.ts';
import { formatHeroCode, normalizeHeroCode } from '../../supabase/functions/_shared/kid-auth.ts';

const STATUS_TEXT: Record<HomeMission['status'], string> = {
  assigned: 'To do', submitted: 'Waiting for your grown-up', approved: 'Done!', sent_back: 'Try again',
};

/** Home and Class stay in separate folders, each with its own count of things to do. */
export function MissionsHome() {
  const { backend, go } = useSession();
  const [todo, setTodo] = useState({ home: 0, cls: 0 });
  useEffect(() => {
    Promise.all([backend.homeMissions(), backend.classMissions()]).then(([h, c]) =>
      setTodo({ home: h.filter((m) => m.status === 'assigned' || m.status === 'sent_back').length, cls: c.filter((m) => !m.result).length }),
    ).catch(() => undefined);
  }, [backend]);
  return (
    <main className="screen">
      <ScreenBar title="Missions" onBack={() => go('home')} />
      <div className="folders">
        <button className="folder home-folder" onClick={() => go('missions-home')}>
          {todo.home > 0 && <i className="red-dot" aria-label={`${todo.home} to do`} />}
          <span className="folder-icon" aria-hidden>🏠</span>
          <b>Home Missions</b>
          <small>From your grown-up</small>
        </button>
        <button className="folder class-folder" onClick={() => go('missions-class')}>
          {todo.cls > 0 && <i className="red-dot" aria-label={`${todo.cls} to do`} />}
          <span className="folder-icon" aria-hidden>🏫</span>
          <b>Class Missions</b>
          <small>From your teacher</small>
        </button>
      </div>
    </main>
  );
}

export function HomeMissions() {
  const { backend, go } = useSession();
  const [items, setItems] = useState<HomeMission[] | null>(null);
  const load = () => backend.homeMissions().then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const done = async (m: HomeMission) => {
    await backend.submitHomeMission(m.id).catch(() => undefined);
    await load();
  };
  return (
    <main className="screen">
      <ScreenBar title="Home Missions" onBack={() => go('missions')} />
      {items === null ? <div className="spinner" /> : (
        <PagedList
          items={items}
          perPage={3}
          empty="No home missions yet. Ask your grown-up to link with your hero code and send you one!"
          render={(m) => (
            <div className={`card mission ${m.status}`} key={m.id}>
              <div className="card-top"><b>{m.title}</b><span className="reward">💎 {m.coins}</span></div>
              {m.details && <p>{m.details}</p>}
              <div className="card-bottom">
                <span className="chip-status">{STATUS_TEXT[m.status]}</span>
                {(m.status === 'assigned' || m.status === 'sent_back') && <button className="btn small primary" onClick={() => done(m)}>I did it!</button>}
              </div>
            </div>
          )}
        />
      )}
    </main>
  );
}

const JOIN_ERRORS: Record<string, string> = {
  invalid_code: "That class code isn't right. Check it with your teacher.",
  wrong_grade: "That class is for a different grade. Check the code with your teacher.",
  already_in_class: "You're already in a class.",
  too_many_tries: 'Too many tries. Ask your teacher and try again later.',
};

export function ClassMissions() {
  const { backend, go, refresh } = useSession();
  const [cls, setCls] = useState<{ name: string } | null | undefined>(undefined);
  const [items, setItems] = useState<ClassMission[]>([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const load = async () => {
    const c = await backend.myClass().catch(() => null);
    setCls(c);
    if (c) setItems(await backend.classMissions().catch(() => []));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const join = async () => {
    const r: JoinClassResult = await backend.joinClass(code).catch(() => ({ ok: false as const, error: 'invalid_code' as const }));
    if (r.ok) { setError(''); await load(); refresh().catch(() => undefined); } else setError(JOIN_ERRORS[r.error]);
  };

  if (cls === undefined) return <main className="screen center"><div className="spinner" /></main>;
  if (cls === null) {
    return (
      <main className="screen">
        <ScreenBar title="Class Missions" onBack={() => go('missions')} />
        <h3 className="center-text">Join your class</h3>
        <p className="hint">Your teacher will give you a class code.</p>
        <label className="field">
          <input autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="CLASS CODE" value={code}
            onChange={(e) => setCode(normalizeHeroCode(e.target.value).slice(0, 6))} />
        </label>
        <p className="error" role="alert">{error}</p>
        <div className="grow" />
        <button className="btn primary" disabled={code.length !== 6} onClick={join}>Join class</button>
      </main>
    );
  }
  return (
    <main className="screen">
      <ScreenBar title={cls.name} onBack={() => go('missions')} />
      <PagedList
        items={items}
        perPage={3}
        empty="No class missions yet. Check back soon!"
        render={(m) => (
          <button className={`card mission clickable${m.result ? ' approved' : ''}`} key={m.id} onClick={() => go(`quiz:${m.id}`)}>
            <div className="card-top"><b>{m.title}</b><span className="reward">💎 up to {m.maxCoins}</span></div>
            <div className="card-bottom">
              <span className="chip-status">{m.result ? `${m.result.scorePct}% · +${m.result.coins} 💎` : `${m.questions.length} questions`}</span>
            </div>
          </button>
        )}
      />
    </main>
  );
}

const chunkText = (text: string, size = 420): string[] => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const pages: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).length > size && cur) { pages.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) pages.push(cur);
  return pages;
};

export function Quiz({ id }: { id: string }) {
  const { backend, go, refresh } = useSession();
  const [mission, setMission] = useState<ClassMission | null>(null);
  const [step, setStep] = useState<'read' | 'ask' | 'result'>('read');
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<ClassResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    backend.classMissions().then((all) => {
      const m = all.find((x) => x.id === id) ?? null;
      setMission(m);
      if (m?.result) { setResult(m.result); setStep('result'); } else if (m && !m.passage) setStep('ask');
    }).catch(() => undefined);
  }, [backend, id]);

  if (!mission) return <main className="screen center"><div className="spinner" /></main>;
  const back = () => go('missions-class');
  const q = mission.questions[i];

  const finish = async (final: number[]) => {
    setBusy(true);
    try {
      setResult(await backend.submitClassMission(id, final));
      setStep('result');
      refresh().catch(() => undefined);
    } finally { setBusy(false); }
  };

  if (step === 'read') {
    const pages = chunkText(mission.passage);
    return (
      <main className="screen">
        <ScreenBar title={mission.title} onBack={back} right={<ReadAloud text={mission.passage} />} />
        <div className="passage"><Pager pages={pages.map((p, n) => <p className="passage-text" key={n}>{p}</p>)} /></div>
        <p className="hint">{pages.length > 1 ? 'Swipe to keep reading.' : 'Read it carefully.'}</p>
        <button className="btn primary" onClick={() => setStep('ask')}>I'm ready for the questions</button>
      </main>
    );
  }

  if (step === 'ask') {
    const chosen = answers[i];
    const last = i === mission.questions.length - 1;
    return (
      <main className="screen">
        <ScreenBar title={`Question ${i + 1} of ${mission.questions.length}`} onBack={back} right={<ReadAloud text={questionText(q.prompt, q.choices)} />} />
        <h3 className="question">{q.prompt}</h3>
        <div className="choices">
          {q.choices.map((c, n) => (
            <button key={n} className={`choice${chosen === n ? ' chosen' : ''}`} aria-pressed={chosen === n}
              onClick={() => setAnswers((a) => { const next = [...a]; next[i] = n; return next; })}>{c}</button>
          ))}
        </div>
        <div className="grow" />
        <button className="btn primary" disabled={chosen === undefined || busy}
          onClick={() => (last ? finish(answers) : setI(i + 1))}>{last ? (busy ? 'Checking…' : 'Finish') : 'Next'}</button>
      </main>
    );
  }

  const r = result!;
  return (
    <main className="screen">
      <ScreenBar title="Results" onBack={back} />
      <div className="score">
        <div className={`score-big${r.passed ? ' pass' : ''}`}>{r.scorePct}%</div>
        <p className="hint">{r.correct} of {r.total} right</p>
        <p className="reward-line">{r.passed ? (r.coins > 0 ? `You earned ${r.coins} 💎!` : 'Great job! No more points for this one.') : 'You need 80% to earn points. Great effort!'}</p>
      </div>
      {r.review ? (
        <>
          <div className="paged">
            <Pager pages={r.review.map((x, n) => (
              <div className="card review" key={n}>
                <b>{mission.questions[n].prompt}</b>
                <p className={x.correct ? 'right' : 'wrong'}>
                  {x.correct ? '✅ You got it!' : `❌ You picked: ${mission.questions[n].choices[answers[n]]}`}
                </p>
                {!x.correct && <p>Right answer: <b>{mission.questions[n].choices[x.rightChoice]}</b></p>}
                {x.explanation && <p className="why">{x.explanation}</p>}
              </div>
            ))} />
          </div>
          <p className="hint">Swipe to see why.</p>
        </>
      ) : <div className="grow" />}
      <button className="btn primary" onClick={back}>Back to class missions</button>
    </main>
  );
}

function TriviaCard() {
  const { backend } = useSession();
  const [t, setT] = useState<TriviaState | null>(null);
  useEffect(() => { backend.triviaState().then(setT).catch(() => undefined); }, [backend]);
  if (!t) return null;
  const when = new Date(`${t.date}T${t.time}:00`).toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' });
  const rsvp = (going: boolean) => backend.triviaRsvp(going).then(setT).catch(() => undefined);
  return (
    <div className="card trivia-card">
      <b>{t.today ? '🎉 Trivia Night is tonight!' : '🎉 Next Trivia Night'}</b>
      <p>{when}. {t.goingCount > 0 ? `${t.goingCount} in your grade ${t.goingCount === 1 ? 'is' : 'are'} coming.` : 'Be the first to join!'}</p>
      <div className="chips">
        <button className={`chip${t.going === true ? ' chosen' : ''}`} onClick={() => rsvp(true)}>I'm in!</button>
        <button className={`chip${t.going === false ? ' chosen' : ''}`} onClick={() => rsvp(false)}>Can't make it</button>
      </div>
    </div>
  );
}

export function Announcements() {
  const { backend, go, refresh } = useSession();
  const [items, setItems] = useState<Announcement[] | null>(null);
  useEffect(() => {
    backend.announcements().then(async (a) => {
      setItems(a.items);
      if (a.unread) { await backend.markAnnouncementsRead().catch(() => undefined); refresh().catch(() => undefined); }
    }).catch(() => setItems([]));
  }, [backend, refresh]);
  return (
    <main className="screen">
      <ScreenBar title="News from the Sensei" onBack={() => go('home')} />
      {items === null ? <div className="spinner" /> : (
        <PagedList items={[{ id: -1 } as Announcement, ...items]} perPage={3} empty="No news yet."
          render={(a) => a.id === -1 ? <TriviaCard key="trivia" /> : (
            <div className="card" key={a.id}>
              <b>{a.title}</b>
              <p>{a.body}</p>
              <small className="muted">{new Date(a.createdAt).toLocaleDateString()}</small>
            </div>
          )} />
      )}
    </main>
  );
}

/** The one-time code a grown-up types (or scans) to link with this hero. */
export function ParentCode() {
  const { backend, go } = useSession();
  const [info, setInfo] = useState<{ code: string; expiresAt: string } | null>(null);
  const [qr, setQr] = useState('');
  useEffect(() => { backend.linkCode().then(setInfo).catch(() => undefined); }, [backend]);
  useEffect(() => {
    if (info) QRCode.toDataURL(`${window.location.origin}/?link=${info.code}`, { margin: 1, width: 320 }).then(setQr);
  }, [info]);
  return (
    <main className="screen center">
      <ScreenBar title="Grown-up code" onBack={() => go('profile')} />
      <p className="hint">Show this to your parent or guardian. They make their own account, then type this code or scan it. It works once and ends in 7 days.</p>
      {info ? (
        <>
          <code className="big-code">{formatHeroCode(info.code)}</code>
          {qr && <img className="qr" src={qr} alt="QR code for your grown-up" />}
          <p className="note">Ends {new Date(info.expiresAt).toLocaleDateString()}</p>
        </>
      ) : <div className="spinner" />}
    </main>
  );
}
