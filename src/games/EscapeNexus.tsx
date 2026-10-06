import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../App.tsx';
import { GameFrame, GameHero } from './GameFrame.tsx';
import { burst, centerOf, flashEdge, popup, shake } from '../lib/fx.ts';
import { beep } from '../lib/sound.ts';
import { ChatButton } from './ChatBox.tsx';
import { PlayerList } from './TriviaClash.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import type { NexusAnswer, NexusView, RoomState } from '../lib/backend.ts';

const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : '';
  if (m.includes('no room')) return "There's no waiting room with that code.";
  if (m.includes('other grade')) return 'That room is for the other grade.';
  if (m.includes('full')) return 'That room is full.';
  if (m.includes('already started')) return 'That game already started.';
  if (m.includes('at least')) return 'You need at least 2 players to start.';
  if (m.includes('fresh')) return "You've seen almost every question! Ask the Sensei for more.";
  if (m.includes('already boosted')) return "You've already used your boost.";
  return "That didn't work. Please try again.";
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Escape the Nexus: every hero breaks their own seal (three questions) before the shared clock runs out. */
export function EscapeNexus() {
  const { backend, go, refresh } = useSession();
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [view, setView] = useState<NexusView | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<NexusAnswer | null>(null);
  const busy = useRef(false);

  useEffect(() => { backend.currentRoom().then(setCode).catch(() => setCode(null)); }, [backend]);

  const poll = useCallback(async (c: string) => {
    try {
      const r = await backend.roomState(c);
      setRoom(r);
      if (r.state === 'playing' || r.state === 'done') setView(await backend.nexusView(c));
    } catch { setCode(null); setRoom(null); setView(null); }
  }, [backend]);
  useEffect(() => {
    if (!code) return;
    poll(code);
    const id = setInterval(() => poll(code), 1000);
    return () => clearInterval(id);
  }, [code, poll]);
  useEffect(() => { if (room?.state === 'done') refresh().catch(() => undefined); }, [room?.state, refresh]);

  const act = async (fn: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true; setError('');
    try { await fn(); if (code) await poll(code); } catch (e) { setError(errText(e)); } finally { busy.current = false; }
  };
  const leave = async () => { await backend.leaveRoom().catch(() => undefined); setCode(null); setRoom(null); setView(null); go('arcade'); };

  if (code === undefined) return <GameFrame title="Escape the Nexus"><div className="spinner" /></GameFrame>;

  if (!code || !room) {
    return (
      <GameFrame title="Escape the Nexus" hint="A team game! Everyone breaks their own seal by answering three questions. If anyone gets stuck, the whole squad is trapped, so help each other. You can only play with your own grade.">
        <GameHero icon="🔐" art="seal-01" />
        <div className="grow" />
        <button className="btn primary" onClick={() => act(async () => setCode(await backend.createRoom('escape-nexus')))}>🏠 Host a room</button>
        <p className="hint">or join a friend's room</p>
        <label className="field plain"><span>Room code</span>
          <input value={typed} maxLength={4} autoCapitalize="characters" onChange={(e) => setTyped(e.target.value.toUpperCase())} />
        </label>
        <p className="error" role="alert">{error}</p>
        <button className="btn" disabled={typed.length < 4} onClick={() => act(async () => setCode(await backend.joinRoom(typed)))}>Join</button>
      </GameFrame>
    );
  }

  if (room.state === 'lobby') {
    return (
      <GameFrame title="Escape the Nexus" onExit={leave} right={<ChatButton />}>
        <p className="hint">Tell your friends this code. Everyone gets their own seal!</p>
        <div className="big-code"><b>{room.code}</b></div>
        <PlayerList room={room} />
        <p className="error" role="alert">{error}</p>
        <div className="grow" />
        {room.host && backend.addPracticeBuddy && <button className="btn ghost" onClick={() => act(() => backend.addPracticeBuddy!())}>🤖 Add a practice buddy</button>}
        {room.host
          ? <button className="btn primary" disabled={room.players.length < room.minPlayers} onClick={() => act(() => backend.startRoom())}>{room.players.length < room.minPlayers ? 'Waiting for friends...' : 'Enter the Nexus!'}</button>
          : <p className="hint">Waiting for the host to start...</p>}
      </GameFrame>
    );
  }

  if (!view) return <GameFrame title="Escape the Nexus" onExit={leave}><div className="spinner" /></GameFrame>;

  if (view.outcome !== 'play') {
    const won = view.outcome === 'won';
    return (
      <GameFrame title="Escape the Nexus" onExit={leave}>
        <div className="grow" />
        <div className="soon-icon" aria-hidden>{won ? '🌟' : '⏳'}</div>
        <h3 className="center-text">{won ? 'The squad escaped!' : 'Time ran out!'}</h3>
        <p className="hint">{won ? 'Every seal is broken. Great teamwork!' : 'Not every seal opened in time. Try again and help each other out!'}</p>
        <div className="players">
          {view.players.map((p) => (
            <div key={p.i} className={`card member${p.me ? ' me' : ''}`}>
              <HeroArt id={p.starter} className="chip-hero" />
              <span><b>{p.name}</b></span>
              <span>{p.solved}/{p.need} {p.done ? '🔓' : '🔒'}</span>
            </div>
          ))}
        </div>
        <div className="grow" />
        <button className="btn primary" onClick={leave}>Back to the Arcade</button>
      </GameFrame>
    );
  }

  const q = view.question;
  const parts = q ? q.prompt.lastIndexOf('\n\n') : -1;
  const passage = q && parts >= 0 ? q.prompt.slice(0, parts) : null;
  const question = q ? (parts < 0 ? q.prompt : q.prompt.slice(parts + 2)) : '';
  const lowTime = view.secondsLeft <= 20;
  const submit = (n: number) => act(async () => {
    setPicked(n);
    const res = await backend.nexusAnswer(n);
    setFeedback(res); setPicked(null);
    const c = centerOf(document.querySelector('.nx-room') ?? document.querySelector('.nxsquad'));
    if (res.correct) { burst(c.x, c.y, '#4ade80', 22, 110); popup(c.x, c.y, 'LOCK OPEN!', '#4ade80', true); beep(784, 180, 'triangle'); }
    else { shake(); flashEdge(); popup(c.x, c.y, `-${res.penalty}s`, '#ff5c7a', true); beep(200, 300, 'sawtooth'); }
  });
  return (
    <GameFrame title="Escape the Nexus" onExit={leave} right={<ChatButton />}>
      <div className={`nxclock${lowTime ? ' low' : ''}`} role="timer" aria-label={`${view.secondsLeft} seconds left`}>
        <b>⏱ {clock(view.secondsLeft)}</b>
        <div className="rush-timer"><i style={{ width: `${view.secondsTotal ? Math.min(100, (view.secondsLeft / view.secondsTotal) * 100) : 0}%` }} /></div>
      </div>
      <div className="nx-room" style={{ backgroundImage: `url(/assets/games/escape-room-0${(view.players.length % 3) + 1}-wide.webp)` }} aria-hidden />
      <div className="nxsquad" aria-label="Squad seals">
        {view.players.map((p) => (
          <div key={p.i} className={`nxmate${p.me ? ' me' : ''}${p.done ? ' done' : ''}`}>
            <img className={`nx-seal${p.done ? ' open' : ''}`} src={`/assets/games/seal-0${(p.i % 6) + 1}.webp`} alt="" draggable={false} />
            <HeroArt id={p.starter} className="chip-hero" />
            <span>{p.me ? 'You' : p.name.split(' ')[0]}</span>
            <b aria-label={`${p.solved} of ${p.need} locks open`}>{Array.from({ length: p.need }, (_, k) => (k < p.solved ? '🔓' : '🔒')).join('')}</b>
          </div>
        ))}
      </div>
      {feedback ? (
        <>
          <div className={`feedback ${feedback.correct ? 'ok' : 'no'}`} role="status">
            <b>{feedback.correct ? '✅ Lock open!' : `❌ Not quite. The squad lost ${feedback.penalty} seconds.`}</b> {feedback.explanation}
          </div>
          <div className="grow" />
          <button className="btn primary" onClick={() => setFeedback(null)}>{q ? 'Next lock' : 'Continue'}</button>
        </>
      ) : q ? (
        <>
          <p className="note">Your seal: lock {view.solved + 1} of {view.need}</p>
          {passage && <div className="passage short"><p className="passage-text">{passage}</p></div>}
          <h3 className="question">{question}</h3>
          <div className="choices">
            {q.choices.map((c, n) => q.hidden.includes(n) ? null : (
              <button key={n} className={`choice${picked === n ? ' chosen' : ''}`} disabled={picked !== null} onClick={() => submit(n)}>{c}</button>
            ))}
          </div>
          {q.hidden.length > 0 && <p className="note">🤝 A teammate boosted you! One wrong answer is gone.</p>}
        </>
      ) : (
        <>
          <div className="soon-icon small" aria-hidden>🔓</div>
          <h3 className="center-text">Your seal is open!</h3>
          <p className="hint">Now help your squad. You can boost one teammate to remove a wrong answer from their question.</p>
          <div className="players">
            {view.players.filter((p) => !p.me && !p.done).map((p) => (
              <div key={p.i} className="card member">
                <HeroArt id={p.starter} className="chip-hero" />
                <span><b>{p.name}</b> {p.solved}/{p.need}</span>
                <button className="btn small primary" disabled={!view.canBoost} onClick={() => act(() => backend.nexusBoost(p.i))}>Boost</button>
              </div>
            ))}
          </div>
          {!view.canBoost && <p className="note">You've used your boost. Cheer them on!</p>}
        </>
      )}
      <p className="error" role="alert">{error}</p>
    </GameFrame>
  );
}
