import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../App.tsx';
import { GameFrame } from './GameFrame.tsx';
import { ChatButton } from './ChatBox.tsx';
import { PlayerList } from './TriviaClash.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import type { HideView, RoomState } from '../lib/backend.ts';

const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : '';
  if (m.includes('no room')) return "There's no waiting room with that code.";
  if (m.includes('other grade')) return 'That room is for the other grade.';
  if (m.includes('full')) return 'That room is full.';
  if (m.includes('already started')) return 'That game already started.';
  if (m.includes('at least')) return 'You need at least 2 players to start.';
  if (m.includes('already checked')) return 'You already checked there.';
  if (m.includes('already sneaked')) return "You already used your sneak this round.";
  return "That didn't work. Please try again.";
};

/** Hide and Seek: hiders pick a spot in the hall and look like the prop there; the seeker checks spots. Everyone seeks once. */
export function HideSeek() {
  const { backend, go, refresh } = useSession();
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [view, setView] = useState<HideView | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const busy = useRef(false);

  useEffect(() => { backend.currentRoom().then(setCode).catch(() => setCode(null)); }, [backend]);

  const poll = useCallback(async (c: string) => {
    try {
      const r = await backend.roomState(c);
      setRoom(r);
      if (r.state === 'playing' || r.state === 'done') setView(await backend.hideView(c));
    } catch { setCode(null); setRoom(null); setView(null); }
  }, [backend]);
  useEffect(() => {
    if (!code) return;
    poll(code);
    const id = setInterval(() => poll(code), 1000);
    return () => clearInterval(id);
  }, [code, poll]);
  useEffect(() => { if (room?.state === 'done') refresh().catch(() => undefined); }, [room?.state, refresh]);
  useEffect(() => { setNote(''); }, [view?.phase, view?.round]);

  const act = async (fn: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true; setError('');
    try { await fn(); if (code) await poll(code); } catch (e) { setError(errText(e)); } finally { busy.current = false; }
  };
  const leave = async () => { await backend.leaveRoom().catch(() => undefined); setCode(null); setRoom(null); setView(null); go('arcade'); };

  if (code === undefined) return <GameFrame title="Hide and Seek"><div className="spinner" /></GameFrame>;

  if (!code || !room) {
    return (
      <GameFrame title="Hide and Seek" hint="Hide in the hall disguised as a prop, or search for your friends! 2 to 6 players, same grade. Everyone gets a turn as the seeker.">
        <div className="grow" />
        <button className="btn primary" onClick={() => act(async () => setCode(await backend.createRoom('hide-seek')))}>🏠 Host a room</button>
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
      <GameFrame title="Hide and Seek" onExit={leave} right={<ChatButton />}>
        <p className="hint">Tell your friends this code. Everyone takes a turn seeking!</p>
        <div className="big-code"><b>{room.code}</b></div>
        <PlayerList room={room} />
        <p className="error" role="alert">{error}</p>
        <div className="grow" />
        {room.host && backend.addPracticeBuddy && <button className="btn ghost" onClick={() => act(() => backend.addPracticeBuddy!())}>🤖 Add a practice buddy</button>}
        {room.host
          ? <button className="btn primary" disabled={room.players.length < room.minPlayers} onClick={() => act(() => backend.startRoom())}>{room.players.length < room.minPlayers ? 'Waiting for friends...' : "Let's play!"}</button>
          : <p className="hint">Waiting for the host to start...</p>}
      </GameFrame>
    );
  }

  if (!view) return <GameFrame title="Hide and Seek" onExit={leave}><div className="spinner" /></GameFrame>;

  const board = (
    <div className="players hs-scores">
      {[...view.players].sort((a, b) => b.score - a.score).map((p) => (
        <div key={p.i} className={`card member${p.me ? ' me' : ''}`}>
          <HeroArt id={p.starter} className="chip-hero" />
          <span><b>{p.me ? 'You' : p.name}</b></span>
          <span>{p.score} ⭐</span>
        </div>
      ))}
    </div>
  );

  if (view.phase === 'done' || view.state === 'done') {
    const top = Math.max(...view.players.map((p) => p.score));
    const winners = view.players.filter((p) => p.score === top).map((p) => (p.me ? 'You' : p.name));
    return (
      <GameFrame title="Hide and Seek" onExit={leave}>
        <div className="soon-icon small" aria-hidden>🏆</div>
        <h3 className="center-text">{winners.length > 1 ? `${winners.join(' and ')} tie!` : `${winners[0]}${winners[0] === 'You' ? ' win!' : ' wins!'}`}</h3>
        {board}
        <div className="grow" />
        <button className="btn primary" onClick={leave}>Back to the Arcade</button>
      </GameFrame>
    );
  }

  const seeker = view.players.find((p) => p.seeker);
  const reveal = view.phase === 'reveal';
  const hiderAt = (i: number) => view.hiders?.filter((h) => h.spot === i) ?? [];
  const foundAt = (i: number) => view.found.find((f) => f.spot === i);
  const tap = (i: number) => {
    if (view.seeker && view.phase === 'seek') {
      if (view.searched.includes(i)) return;
      act(async () => { const r = await backend.hideSearch(i); setNote(r.found ? `🎯 Found ${r.found === 1 ? 'a hider' : r.found + ' hiders'}!` : 'Nobody there...'); });
    } else if (!view.seeker && (view.phase === 'hide' || (view.phase === 'seek' && view.canSneak)) && i !== view.mySpot) {
      act(async () => { await backend.hideMove(i); setNote(view.phase === 'seek' ? '🥷 You sneaked away!' : ''); });
    }
  };
  const status = reveal ? 'Round over!'
    : view.seeker ? (view.phase === 'hide' ? '🙈 You are the seeker. Hiders are hiding...' : `🔎 Find them! ${view.searchesLeft} searches left`)
    : view.meCaught ? `😬 ${seeker?.name ?? 'The seeker'} found you!`
    : view.phase === 'hide' ? '🫥 Pick your hiding spot. You look like the prop there.'
    : view.canSneak ? '🤫 Stay still, or tap a new spot to sneak (once).' : '🤫 Stay still...';
  return (
    <GameFrame title={`Hide and Seek ${view.round + 1}/${view.rounds}`} onExit={leave} right={<ChatButton />}>
      <div className="nxclock" role="timer" aria-label={`${view.secondsLeft} seconds left`}>
        <b>{status}</b>
        <div className="rush-timer"><i style={{ width: `${view.secondsTotal ? Math.min(100, (view.secondsLeft / view.secondsTotal) * 100) : 0}%` }} /></div>
      </div>
      <div className="hs-grid" role="group" aria-label="The hall">
        {view.layout.map((prop, i) => {
          const f = foundAt(i);
          const hs = hiderAt(i);
          const cls = `hs-cell${view.mySpot === i ? ' mine' : ''}${view.searched.includes(i) ? ' checked' : ''}${f || hs.length ? ' hit' : ''}`;
          return (
            <button key={i} className={cls} onClick={() => tap(i)} aria-label={`${prop} spot ${i + 1}${view.mySpot === i ? ', you are hiding here' : ''}`}>
              <span aria-hidden>{prop}</span>
              {view.mySpot === i && !reveal && <i className="hs-tag">🫥 You</i>}
              {f && <i className="hs-tag">🎯 {f.name.split(' ')[0]}</i>}
              {reveal && !f && hs.length > 0 && <i className="hs-tag">🫣 {hs.map((h) => h.name.split(' ')[0]).join(' ')}</i>}
              {view.searched.includes(i) && !f && !hs.length && <i className="hs-x" aria-hidden>✖</i>}
            </button>
          );
        })}
      </div>
      <p className="note" role="status">{error || note || (reveal ? 'The next round starts soon.' : ' ')}</p>
      {reveal && board}
    </GameFrame>
  );
}
