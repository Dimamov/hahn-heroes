import { useEffect, useState } from 'react';
import type { Backend, ClassInfo, ClassLiveState, ClassMissionResults } from '../../lib/backend.ts';
import { ScreenBar } from '../../components/ScreenBar.tsx';
import { ClassGoalCard } from '../../components/ClassGoalCard.tsx';
import { Board, BossBar, TimerBar, letter } from '../../components/LiveParts.tsx';

const SUBJECTS: [string, string][] = [['mixed', 'Mixed'], ['math', 'Math'], ['vocab', 'Words'], ['reading', 'Reading'], ['science', 'Science']];

/** Teacher side of a live class game: set it up, show the code, run it on the big screen. */
export function LiveClass({ backend, cls, onBack }: { backend: Backend; cls: ClassInfo; onBack: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [st, setSt] = useState<ClassLiveState | null>(null);
  const [kind, setKind] = useState<'quiz' | 'boss'>('quiz');
  const [subject, setSubject] = useState('mixed');
  const [count, setCount] = useState(10);
  const [mission, setMission] = useState('');
  const [missions, setMissions] = useState<ClassMissionResults[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { backend.classResults(cls.id).then(setMissions).catch(() => setMissions([])); }, [backend, cls.id]);

  useEffect(() => {
    if (!code) return;
    let stop = false;
    const tick = async () => { try { const s = await backend.classLiveState(code); if (!stop) setSt(s); } catch { /* keep the last screen */ } };
    void tick();
    const id = window.setInterval(tick, 1000);
    return () => { stop = true; window.clearInterval(id); };
  }, [backend, code]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); } catch { setError("That didn't work. Please try again."); }
    setBusy(false);
  };
  const create = () => run(async () => { setCode(await backend.classLiveCreate(cls.id, kind, subject, count, mission || undefined)); });
  const end = () => run(async () => { if (code) await backend.classLiveEnd(code); setCode(null); setSt(null); });

  if (!code || !st) {
    return (
      <main className="screen live wide">
        <ScreenBar title={`Live class · ${cls.name}`} onBack={onBack} />
        <div className="live-setup">
          <h3>What do you want to run?</h3>
          <div className="seg">
            <button className={kind === 'quiz' ? 'chosen' : ''} onClick={() => setKind('quiz')}>⚡ Quiz battle</button>
            <button className={kind === 'boss' ? 'chosen' : ''} onClick={() => setKind('boss')}>🐲 Boss battle</button>
          </div>
          <p className="hint">{kind === 'quiz' ? 'Everyone races on the same questions. Faster right answers score more.' : 'The whole class fights one boss together. Every right answer hurts it.'}</p>
          <h4>Subject</h4>
          <div className="chips">{SUBJECTS.map(([k, l]) => <button key={k} className={`chip${subject === k && !mission ? ' chosen' : ''}`} onClick={() => { setSubject(k); setMission(''); }}>{l}</button>)}</div>
          {missions.length > 0 && (
            <>
              <h4>Or use one of your class quizzes</h4>
              <div className="chips">{missions.map((m) => <button key={m.id} className={`chip${mission === m.id ? ' chosen' : ''}`} onClick={() => setMission(mission === m.id ? '' : m.id)}>{m.title}</button>)}</div>
            </>
          )}
          {!mission && (
            <>
              <h4>Questions</h4>
              <div className="chips">{[8, 12, 16].map((n) => <button key={n} className={`chip${count === n ? ' chosen' : ''}`} onClick={() => setCount(n)}>{n}</button>)}</div>
            </>
          )}
          <p className="error" role="alert">{error}</p>
          <button className="btn primary big" disabled={busy} onClick={create}>Make the game</button>
          <ClassGoalCard backend={backend} classId={cls.id} />
        </div>
      </main>
    );
  }

  const boss = st.boss;
  if (st.state === 'lobby') {
    return (
      <main className="screen live wide">
        <ScreenBar title={st.kind === 'boss' ? 'Boss battle' : 'Quiz battle'} onBack={end} />
        <div className="live-join">
          <p className="hint">On your Chromebook, open HAHN Heroes and tap the live class button, or type this code:</p>
          <div className="live-code-big" aria-label="Game code">{st.code}</div>
          <h3>{st.players.length} {st.players.length === 1 ? 'hero' : 'heroes'} joined</h3>
          <div className="chips">{st.players.map((p, i) => <span key={i} className="chip">{p.name}</span>)}</div>
          <p className="error" role="alert">{error}</p>
          <div className="btn-grid">
            <button className="btn ghost" disabled={busy} onClick={end}>Cancel</button>
            <button className="btn primary big" disabled={busy || st.players.length === 0} onClick={() => run(() => backend.classLiveStart(st.code))}>Start!</button>
          </div>
        </div>
      </main>
    );
  }

  if (st.state === 'done' || st.state === 'closed') {
    const won = boss && boss.hp <= 0;
    return (
      <main className="screen live wide">
        <ScreenBar title="Live class" onBack={onBack} />
        <div className="live-join">
          <div className="soon-icon win-burst" aria-hidden>🏆</div>
          <h3>{boss ? (won ? `The class beat ${boss.name}!` : `${boss.name} got away this time`) : 'Quiz battle over!'}</h3>
          <Board players={st.players} limit={10} big />
          <button className="btn primary" onClick={() => { setCode(null); setSt(null); }}>Run another</button>
        </div>
      </main>
    );
  }

  const q = st.question!;
  const reveal = st.phase === 'reveal';
  const counts = st.choiceCounts ?? {};
  const top = Math.max(1, ...Object.values(counts));
  return (
    <main className="screen live wide">
      <ScreenBar title={`Question ${st.idx + 1}/${st.total}`} onBack={end} right={<b className="note pill">⏱ {st.secondsLeft ?? 0}s</b>} />
      <TimerBar state={st} />
      {boss && <BossBar boss={boss} />}
      <div className="live-grid">
        <section className="live-main">
          <h3 className="question big-q">{q.prompt}</h3>
          <div className="live-choices">
            {q.choices.map((c, n) => (
              <div key={n} className={`choice live-choice teacher${reveal && n === st.rightChoice ? ' right-choice' : ''}`}>
                <b className="key">{letter(n)}</b><span>{c}</span>
                {reveal && <i className="live-count" style={{ width: `${((counts[String(n)] ?? 0) / top) * 100}%` }}><em>{counts[String(n)] ?? 0}</em></i>}
              </div>
            ))}
          </div>
          <p className="note">{reveal ? st.explanation : `${st.answered ?? 0} of ${st.players.length} answered`}</p>
          <p className="error" role="alert">{error}</p>
          <div className="btn-grid">
            <button className="btn ghost" disabled={busy} onClick={() => run(() => backend.classLiveSkip(st.code))}>Skip ⏭</button>
            <button className="btn ghost" disabled={busy} onClick={end}>End game</button>
          </div>
        </section>
        <aside className="live-side"><Board players={st.players} limit={8} big /></aside>
      </div>
    </main>
  );
}
