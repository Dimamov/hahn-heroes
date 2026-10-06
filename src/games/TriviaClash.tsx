import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../App.tsx';
import { GameFrame, GameHero } from './GameFrame.tsx';
import { ChatButton } from './ChatBox.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import type { RoomState } from '../lib/backend.ts';

const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : '';
  if (m.includes('no room')) return "There's no waiting room with that code.";
  if (m.includes('other grade')) return 'That room is for the other grade.';
  if (m.includes('full')) return 'That room is full.';
  if (m.includes('already started')) return 'That game already started.';
  if (m.includes('at least')) return 'You need at least 2 players to start.';
  if (m.includes('fresh')) return "You've seen almost every question! Ask the Sensei for more.";
  return "That didn't work. Please try again.";
};

/** Trivia Clash: a private room quiz, one fresh question at a time, faster right answers score more. */
export function TriviaClash() {
  const { backend, go, refresh } = useSession();
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const busy = useRef(false);

  useEffect(() => { backend.currentRoom().then(setCode).catch(() => setCode(null)); }, [backend]);

  const poll = useCallback(async (c: string) => {
    try { setRoom(await backend.roomState(c)); } catch { setCode(null); setRoom(null); }
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
    try { await fn(); } catch (e) { setError(errText(e)); } finally { busy.current = false; }
  };
  const leave = async () => { await backend.leaveRoom().catch(() => undefined); setCode(null); setRoom(null); go('arcade'); };

  if (code === undefined) return <GameFrame title="Trivia Clash"><div className="spinner" /></GameFrame>;

  if (!code || !room) {
    return (
      <GameFrame title="Trivia Clash" hint="Race your friends! Everyone gets the same fresh questions. You can only play with your own grade.">
        <GameHero icon="⚡" />
        <div className="grow" />
        <button className="btn primary" onClick={() => act(async () => setCode(await backend.createRoom('trivia-clash')))}>🏠 Host a room</button>
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
      <GameFrame title="Trivia Clash" onExit={leave} right={<ChatButton />}>
        <p className="hint">Tell your friends this code:</p>
        <div className="big-code"><b>{room.code}</b></div>
        <PlayerList room={room} />
        <p className="error" role="alert">{error}</p>
        <div className="grow" />
        {room.host && backend.addPracticeBuddy && <button className="btn ghost" onClick={() => act(() => backend.addPracticeBuddy!())}>🤖 Add a practice buddy</button>}
        {room.host
          ? <button className="btn primary" disabled={room.players.length < room.minPlayers} onClick={() => act(() => backend.startRoom())}>{room.players.length < room.minPlayers ? 'Waiting for friends...' : 'Start the game!'}</button>
          : <p className="hint">Waiting for the host to start...</p>}
      </GameFrame>
    );
  }

  if (room.state === 'done') {
    const me = room.players.find((p) => p.me);
    const place = room.players.findIndex((p) => p.me) + 1;
    return (
      <GameFrame title="Trivia Clash" onExit={leave}>
        <div className="grow" />
        <div className="soon-icon" aria-hidden>{place === 1 ? '🏆' : '🎉'}</div>
        <h3 className="center-text">{place === 1 ? 'You won!' : `You finished #${place}`}</h3>
        <p className="hint">You scored {me?.score ?? 0} points. Every right answer also earned learning rewards.</p>
        <PlayerList room={room} />
        <div className="grow" />
        <button className="btn primary" onClick={leave}>Back to the Arcade</button>
      </GameFrame>
    );
  }

  const q = room.question!;
  const parts = q.prompt.lastIndexOf('\n\n');
  const passage = parts < 0 ? null : q.prompt.slice(0, parts);
  const question = parts < 0 ? q.prompt : q.prompt.slice(parts + 2);
  const reveal = room.phase === 'reveal';
  const picked = room.myChoice ?? null;
  return (
    <GameFrame title={`Question ${room.idx + 1}/${room.total}`} onExit={leave} right={<ChatButton />}>
      <div className="rush-timer" aria-label={`${room.secondsLeft} seconds left`}>
        <i style={{ width: `${((room.secondsLeft ?? 0) / (reveal ? 5 : room.seconds ?? 20)) * 100}%` }} />
      </div>
      {passage && <div className="passage short"><p className="passage-text">{passage}</p></div>}
      <h3 className="question">{question}</h3>
      <div className="choices">
        {q.choices.map((c, n) => {
          const state = reveal ? (n === room.rightChoice ? ' right-choice' : n === picked ? ' wrong-choice' : '') : picked === n ? ' chosen' : '';
          return <button key={n} className={`choice${state}`} disabled={reveal || picked !== null} onClick={() => act(async () => { await backend.roomAnswer(n); await poll(room.code); })}>{c}</button>;
        })}
      </div>
      {reveal
        ? <div className={`feedback ${(room.myPoints ?? 0) > 0 ? 'ok' : 'no'}`} role="status"><b>{(room.myPoints ?? 0) > 0 ? `✅ +${room.myPoints}` : picked === null ? '⏰ Time ran out.' : '❌ Not quite.'}</b> {room.explanation}</div>
        : <p className="note">{picked !== null ? 'Answer locked in! Waiting for the others...' : 'Pick your answer!'}</p>}
      <div className="grow" />
      <Scores room={room} />
    </GameFrame>
  );
}

export function PlayerList({ room }: { room: RoomState }) {
  return (
    <div className="players">
      {room.players.map((p) => (
        <div className={`card member${p.me ? ' me' : ''}`} key={p.name}>
          <HeroArt id={p.starter} className="chip-hero" />
          <span><b>{p.name}</b>{p.host && ' 👑'}</span>
          {room.state !== 'lobby' && <b>{p.score}</b>}
        </div>
      ))}
    </div>
  );
}

function Scores({ room }: { room: RoomState }) {
  return (
    <div className="scorebar" aria-label="Scores">
      {room.players.map((p) => <span key={p.name} className={p.me ? 'me' : ''}>{p.answered ? '✔ ' : ''}{p.name.split(' ')[0]} {p.score}</span>)}
    </div>
  );
}
