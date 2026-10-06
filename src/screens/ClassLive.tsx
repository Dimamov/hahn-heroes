import { useEffect, useRef, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { ClassGoalCard } from '../components/ClassGoalCard.tsx';
import { Board, BossBar, MysteryPicture, TimerBar, letter } from '../components/LiveParts.tsx';
import type { ClassLiveOpen, ClassLiveState } from '../lib/backend.ts';
import { beep } from '../lib/sound.ts';
import { burst, centerOf, flashEdge, popup, shake } from '../lib/fx.ts';

const KIND_TITLE = { quiz: 'Quiz battle', boss: 'Boss battle', mystery: 'Mystery reveal' } as const;
const KIND_ICON = { quiz: '⚡', boss: '🐲', mystery: '🖼️' } as const;

const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : '';
  if (m.includes('no live class')) return 'There is no live class with that code for your class.';
  if (m.includes('already started')) return 'That game already started. Ask your teacher to start a new one.';
  return "That didn't work. Please try again.";
};

/** Live class: a quiz battle or a boss battle your teacher runs for the whole class. Built for a Chromebook, works on a phone. */
export function ClassLive() {
  const { backend, go, refresh } = useSession();
  const [open, setOpen] = useState<ClassLiveOpen | null | undefined>(undefined);
  const [code, setCode] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [st, setSt] = useState<ClassLiveState | null>(null);
  const [error, setError] = useState('');
  const shown = useRef('');

  useEffect(() => { backend.classLiveOpen().then((o) => { setOpen(o); if (o?.joined) setCode(o.code); }).catch(() => setOpen(null)); }, [backend]);

  useEffect(() => {
    if (!code) return;
    let stop = false;
    const tick = async () => {
      try { const s = await backend.classLiveState(code); if (!stop) setSt(s); }
      catch { if (!stop) { setError('That game is not available any more.'); setCode(null); setSt(null); } }
    };
    void tick();
    const id = window.setInterval(tick, 1000);
    return () => { stop = true; window.clearInterval(id); };
  }, [backend, code]);

  const join = async (c: string) => {
    setError('');
    try { setCode(await backend.classLiveJoin(c)); } catch (e) { setError(errText(e)); }
  };
  const pick = (n: number) => {
    if (!st || st.state !== 'playing' || st.phase !== 'question' || st.myChoice != null) return;
    setSt({ ...st, myChoice: n });
    beep(520, 80, 'triangle');
    backend.classLiveAnswer(n).catch(() => undefined);
  };

  // Keys 1 to 4 or A to D answer, for Chromebooks.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const n = '1234'.includes(k) && k.length === 1 ? Number(k) - 1 : 'abcd'.includes(k) && k.length === 1 ? 'abcd'.indexOf(k) : -1;
      if (n >= 0 && st?.question && n < st.question.choices.length) pick(n);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Effects once per revealed answer, and refresh coins when the game ends.
  const revealKey = st?.state === 'playing' && st.phase === 'reveal' ? `${st.code}-${st.idx}` : '';
  useEffect(() => {
    if (!st || !revealKey || shown.current === revealKey) return;
    shown.current = revealKey;
    const c = centerOf(document.querySelector('.live-choices'));
    if ((st.myPoints ?? 0) > 0) {
      burst(c.x, c.y, '#4ade80', 20, 110);
      popup(c.x, c.y, st.kind === 'boss' ? `-${st.myDamage} HP` : st.kind === 'mystery' ? 'Piece found!' : `+${st.myPoints}`, '#4ade80', true);
      beep(784, 160, 'triangle');
    } else { shake(document.querySelector('.live-choices'), 5); flashEdge(); beep(200, 250, 'sawtooth'); }
  }, [revealKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (st?.state === 'done') void refresh(); }, [st?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const leave = async () => { if (!st || st.state === 'lobby') await backend.classLiveLeave().catch(() => undefined); go('home'); };

  if (!code || !st) {
    return (
      <main className="screen live wide">
        <ScreenBar title="Live class" onBack={() => go('home')} />
        <div className="live-join">
          <div className="soon-icon" aria-hidden>🏫</div>
          {open === undefined ? <div className="spinner" /> : open
            ? <button className="btn primary big" onClick={() => join(open.code)}>{open.kind === 'boss' ? '🐲 Join the boss battle' : open.kind === 'mystery' ? '🖼️ Join the mystery' : '⚡ Join the quiz battle'}</button>
            : <p className="hint">Your teacher has not started a live game yet. When they do, a big button shows up here and on Home.</p>}
          <p className="hint">Or type the code from the screen</p>
          <input className="live-code" value={typed} maxLength={4} autoCapitalize="characters" aria-label="Class code" onChange={(e) => setTyped(e.target.value.toUpperCase())} />
          <p className="error" role="alert">{error}</p>
          <button className="btn" disabled={typed.length < 4} onClick={() => join(typed)}>Join</button>
          <ClassGoalCard backend={backend} onClaimed={() => void refresh()} />
        </div>
      </main>
    );
  }

  const boss = st.boss;
  if (st.state === 'lobby') {
    return (
      <main className="screen live wide">
        <ScreenBar title={KIND_TITLE[st.kind]} onBack={leave} />
        <div className="live-join">
          <div className="soon-icon" aria-hidden>{KIND_ICON[st.kind]}</div>
          <h3>You are in!</h3>
          <p className="hint">Waiting for your teacher to start. {st.players.length} {st.players.length === 1 ? 'hero is' : 'heroes are'} here.</p>
          <div className="chips">{st.players.map((p, i) => <span key={i} className={`chip${p.me ? ' chosen' : ''}`}>{p.name}</span>)}</div>
        </div>
      </main>
    );
  }
  if (st.state === 'done' || st.state === 'closed') {
    const won = boss && boss.hp <= 0;
    return (
      <main className="screen live wide">
        <ScreenBar title="Live class" onBack={() => go('home')} />
        <div className="live-join">
          <div className="soon-icon win-burst" aria-hidden>{boss ? (won ? '🏆' : boss.icon) : '🏆'}</div>
          <h3>{st.kind === 'mystery' ? (won ? 'Your class uncovered the whole picture!' : 'The picture stayed a mystery this time') : boss ? (won ? `Your class beat ${boss.name}!` : `${boss.name} got away this time`) : 'Quiz battle over!'}</h3>
          {st.kind === 'mystery' && boss && <MysteryPicture code={st.code} boss={{ ...boss, hp: won ? 0 : boss.hp }} />}
          {st.myReward !== undefined && <p className="hint">{st.myReward > 0 ? `+${st.myReward} 💎 Nexus points and some XP for the class!` : 'Answer at least half the questions to earn points next time.'}</p>}
          <Board players={st.players} limit={5} />
          <button className="btn primary" onClick={() => go('home')}>Back to Home</button>
        </div>
      </main>
    );
  }

  const q = st.question!;
  const reveal = st.phase === 'reveal';
  return (
    <main className="screen live wide">
      <ScreenBar title={`Question ${st.idx + 1}/${st.total}`} onBack={leave} right={<b className="note pill">⏱ {st.secondsLeft ?? 0}s</b>} />
      <TimerBar state={st} />
      {boss && (st.kind === 'mystery' ? <MysteryPicture code={st.code} boss={boss} /> : <BossBar boss={boss} />)}
      <div className="live-grid">
        <section className="live-main">
          <h3 className="question">{q.prompt}</h3>
          <div className="live-choices">
            {q.choices.map((c, n) => {
              const state = reveal ? (n === st.rightChoice ? ' right-choice' : n === st.myChoice ? ' wrong-choice' : '') : st.myChoice === n ? ' chosen' : '';
              return (
                <button key={n} className={`choice live-choice${state}`} disabled={reveal || st.myChoice != null} onClick={() => pick(n)}>
                  <b className="key">{letter(n)}</b><span>{c}</span>
                </button>
              );
            })}
          </div>
          {reveal
            ? <div className={`feedback ${(st.myPoints ?? 0) > 0 ? 'ok' : 'no'}`} role="status"><b>{(st.myPoints ?? 0) > 0 ? (st.kind === 'boss' ? `✅ Hit! -${st.myDamage} HP` : st.kind === 'mystery' ? '✅ You uncovered a piece!' : `✅ +${st.myPoints}`) : st.myChoice == null ? '⏰ Time ran out.' : '❌ Not quite.'}</b> {st.explanation}</div>
            : <p className="note">{st.myChoice != null ? 'Answer locked in! Waiting for the class…' : 'Pick your answer. You can press A, B, C or D too.'}</p>}
        </section>
        <aside className="live-side"><Board players={st.players} limit={6} /></aside>
      </div>
    </main>
  );
}
