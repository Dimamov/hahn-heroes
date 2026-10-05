import { useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { ReadAloud } from '../components/ReadAloud.tsx';
import { questionText } from '../lib/speak.ts';
import { cacheSet, cachedSet, dropFromCache, flushAnswers, looksOffline, queueAnswer } from '../lib/offline.ts';
import type { AnswerResult, PracticeQuestion, Subject, SubjectProgress, SurgeView } from '../lib/backend.ts';

export const SUBJECT_INFO: Record<Subject, { label: string; icon: string; blurb: string }> = {
  math: { label: 'Math', icon: '🔢', blurb: 'Fractions, decimals, ratios and more' },
  vocab: { label: 'Word Power', icon: '🔤', blurb: 'Meanings, roots and context clues' },
  reading: { label: 'Reading', icon: '📚', blurb: 'Read a short story, then answer' },
  science: { label: 'Science', icon: '🔬', blurb: 'Life, earth and physical science' },
};

/** Four subject folders, each showing how much is done and how much is still new. */
export function LearnHome() {
  const { backend, go } = useSession();
  const [progress, setProgress] = useState<SubjectProgress[] | null>(null);
  useEffect(() => { backend.learning().then(setProgress).catch(() => setProgress([])); }, [backend]);
  return (
    <main className="screen">
      <ScreenBar title="Learn" onBack={() => go('home')} />
      <p className="hint">Right answers earn points. Every question is brand new, just for you.</p>
      <div className="subjects">
        {(Object.keys(SUBJECT_INFO) as Subject[]).map((s) => {
          const p = progress?.find((x) => x.subject === s);
          return (
            <button className="folder subject" key={s} onClick={() => go(`practice:${s}`)}>
              <span className="folder-icon" aria-hidden>{SUBJECT_INFO[s].icon}</span>
              <b>{SUBJECT_INFO[s].label}</b>
              <small>{SUBJECT_INFO[s].blurb}</small>
              {p && <em>{p.left > 0 ? `${p.left} new questions` : 'All done for now!'}{p.answered > 0 ? ` · ${p.correct}/${p.answered} right` : ''}</em>}
            </button>
          );
        })}
      </div>
    </main>
  );
}

/** Reading questions carry a passage before a blank line, then the question itself. */
function splitPrompt(prompt: string): { passage: string | null; question: string } {
  const i = prompt.lastIndexOf('\n\n');
  return i < 0 ? { passage: null, question: prompt } : { passage: prompt.slice(0, i), question: prompt.slice(i + 2) };
}

type Tally = { right: number; coins: number; xp: number; sp: number };

export function Practice({ subject }: { subject: Subject }) {
  const { backend, hero, go, refresh } = useSession();
  const [set, setSet] = useState<{ questions: PracticeQuestion[]; remaining: number } | null>(null);
  const [i, setI] = useState(0);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [tally, setTally] = useState<Tally>({ right: 0, coins: 0, xp: 0, sp: 0 });
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [surge, setSurge] = useState<(SurgeView & { endAt: number }) | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!surge?.active) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [surge]);
  const [pending, setPending] = useState(false); // this answer is saved on the device, waiting for Wi-Fi
  const [waiting, setWaiting] = useState(0);
  const [offlineStart, setOfflineStart] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const info = SUBJECT_INFO[subject];

  const load = () => {
    setSet(null); setI(0); setResult(null); setPicked(null); setPending(false); setWaiting(0); setOfflineStart(false); setDone(false); setTally({ right: 0, coins: 0, xp: 0, sp: 0 });
    flushAnswers(backend, hero.id).catch(() => undefined)
      .then(() => backend.startPractice(subject))
      .then((s) => { cacheSet(hero.id, subject, s); setSet(s); })
      .catch((e) => {
        const saved = looksOffline(e) ? cachedSet(hero.id, subject) : null;
        setOfflineStart(!saved && looksOffline(e));
        setSet(saved ?? { questions: [], remaining: 0 });
      });
  };
  useEffect(load, [subject]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => go('learn');
  if (!set) return <main className="screen center"><div className="spinner" /></main>;
  if (!set.questions.length && offlineStart) {
    return (
      <main className="screen center">
        <div className="grow" /><div className="soon-icon" aria-hidden>📴</div>
        <h3>No Wi-Fi right now</h3>
        <p className="hint">Open {info.label} once while you are online and then you can practice it without Wi-Fi.</p>
        <div className="grow" /><button className="btn primary" onClick={back}>Back to Learn</button>
      </main>
    );
  }
  if (!set.questions.length) {
    return (
      <main className="screen center">
        <div className="grow" /><div className="soon-icon" aria-hidden>🏆</div>
        <h3>You finished every {info.label} question!</h3>
        <p className="hint">New questions are added all the time. Try another subject for now.</p>
        <div className="grow" /><button className="btn primary" onClick={back}>Back to Learn</button>
      </main>
    );
  }

  if (done) {
    return (
      <main className="screen">
        <ScreenBar title="Nice work!" onBack={back} />
        <div className="score">
          <div className="score-big pass">{tally.right}/{set.questions.length}</div>
          <p className="hint">right in {info.label}</p>
          <p className="reward-line">+{tally.coins} 💎 · +{tally.xp} XP · +{tally.sp} skill {tally.sp === 1 ? 'point' : 'points'}</p>
          {waiting > 0 && <p className="hint" role="status">📴 {waiting} {waiting === 1 ? 'answer is' : 'answers are'} saved and will count when you are back online.</p>}
        </div>
        <div className="grow" />
        {set.remaining > 0 && <button className="btn primary" onClick={load}>Practice more ({set.remaining} new)</button>}
        <button className={`btn${set.remaining > 0 ? ' ghost' : ' primary'}`} onClick={back}>Back to Learn</button>
      </main>
    );
  }

  const q = set.questions[i];
  const { passage, question } = splitPrompt(q.prompt);
  const last = i === set.questions.length - 1;

  const choose = async (n: number) => {
    if (result || pending) return;
    setPicked(n);
    setError('');
    try {
      const r = await backend.answerQuestion(q.id, n);
      dropFromCache(hero.id, subject, q.id);
      setResult(r);
      if (r.surge) setSurge({ ...r.surge, endAt: Date.now() + r.surge.secondsLeft * 1000 });
      if (r.correct && r.awarded) {
        setTally((t) => ({ right: t.right + 1, coins: t.coins + r.awarded!.coins, xp: t.xp + r.awarded!.xp, sp: t.sp + r.awarded!.skillPoints }));
      } else if (r.correct) setTally((t) => ({ ...t, right: t.right + 1 }));
      refresh().catch(() => undefined);
    } catch (e) {
      if (looksOffline(e) && queueAnswer({ hero: hero.id, id: q.id, choice: n, subject })) { setPending(true); setWaiting((w) => w + 1); return; }
      setPicked(null); setError("That answer didn't go through. Tap it again.");
    }
  };
  const next = () => { if (last) setDone(true); else { setI(i + 1); setResult(null); setPending(false); setPicked(null); } };

  return (
    <main className="screen">
      <ScreenBar title={`${info.label} ${i + 1}/${set.questions.length}`} onBack={back} right={<ReadAloud text={questionText(question, q.choices, passage)} />} />
      {!online && <div className="surge" role="status">📴 No Wi-Fi: your answers are saved and sent later.</div>}
      {surge && (surge.active && surge.endAt > Date.now()
        ? <div className="surge on" role="status">⚡ Nexus Surge! Points x{surge.mult} · {Math.floor((surge.endAt - Date.now()) / 60000)}:{String(Math.floor(((surge.endAt - Date.now()) % 60000) / 1000)).padStart(2, '0')} left{surge.started ? ' 🎉 It just started!' : ''}</div>
        : <div className="surge" role="status">⚡ Surge: {surge.streak}/{surge.need} right in a row</div>)}
      {passage && <div className="passage short"><p className="passage-text">{passage}</p></div>}
      <h3 className="question">{question}</h3>
      <div className="choices">
        {q.choices.map((c, n) => {
          const state = !result ? (picked === n ? ' chosen' : '') : n === result.rightChoice ? ' right-choice' : n === picked ? ' wrong-choice' : '';
          return <button key={n} className={`choice${state}`} disabled={!!result || pending} onClick={() => choose(n)}>{c}</button>;
        })}
      </div>
      <p className="error" role="alert">{error}</p>
      {pending && <div className="feedback" role="status">📴 Saved! We will check it and give your points when you are back online.</div>}
      {result && (
        <div className={`feedback ${result.correct ? 'ok' : 'no'}`} role="status">
          <b>{result.correct ? '✅ Yes!' : '❌ Not quite.'}</b> {result.explanation}
        </div>
      )}
      <div className="grow" />
      {(result || pending) && <button className="btn primary" onClick={next}>{last ? 'See my score' : 'Next'}</button>}
    </main>
  );
}
