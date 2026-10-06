import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../App.tsx';
import { GameFrame, GameHero } from './GameFrame.tsx';
import { ChatButton } from './ChatBox.tsx';
import { PlayerList } from './TriviaClash.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import type { OdinView, RoomState } from '../lib/backend.ts';
import { COLOR_NAMES, ODIN_COLORS, cardFace, cardName, handColumns, isWild, playable, type OdinColor } from '../lib/odin-rules.ts';

const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : '';
  if (m.includes('no room')) return "There's no waiting room with that code.";
  if (m.includes('other grade')) return 'That room is for the other grade.';
  if (m.includes('full')) return 'That room is full.';
  if (m.includes('already started')) return 'That game already started.';
  if (m.includes('at least')) return 'You need at least 2 players to start.';
  if (m.includes('not your turn')) return "It's not your turn yet.";
  if (m.includes('match')) return "That card doesn't match.";
  return "That didn't work. Please try again.";
};

/** One card face. Colour is also spelled out so the game never depends on telling colours apart. */
function Card({ card, dim, onClick, label }: { card: string; dim?: boolean; onClick?: () => void; label?: string }) {
  const f = cardFace(card);
  const cls = `ocard c-${card[0]}${dim ? ' dim' : ''}`;
  const inner = (
    <>
      <i>{isWild(card) ? '' : COLOR_NAMES[card[0] as OdinColor][0]}</i>
      <b>{f.big}</b>
      <em>{f.small}</em>
    </>
  );
  return onClick
    ? <button className={cls} onClick={onClick} aria-label={label ?? cardName(card)} aria-disabled={dim}>{inner}</button>
    : <div className={cls} role="img" aria-label={label ?? cardName(card)}>{inner}</div>;
}

/** ODIN: match the colour or number on the pile, use action cards, and be first to empty your hand. */
export function Odin() {
  const { backend, go, refresh } = useSession();
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [view, setView] = useState<OdinView | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [pickFor, setPickFor] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => { backend.currentRoom().then(setCode).catch(() => setCode(null)); }, [backend]);

  const poll = useCallback(async (c: string) => {
    try {
      const r = await backend.roomState(c);
      setRoom(r);
      if (r.state === 'playing' || r.state === 'done') setView(await backend.odinView(c));
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

  if (code === undefined) return <GameFrame title="ODIN"><div className="spinner" /></GameFrame>;

  if (!code || !room) {
    return (
      <GameFrame title="ODIN" hint="Match the colour or number, use action cards, and be first to run out of cards. You can only play with your own grade.">
        <GameHero icon="🃏" />
        <div className="grow" />
        <button className="btn primary" onClick={() => act(async () => setCode(await backend.createRoom('odin')))}>🏠 Host a room</button>
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
      <GameFrame title="ODIN" onExit={leave} right={<ChatButton />}>
        <p className="hint">Tell your friends this code:</p>
        <div className="big-code"><b>{room.code}</b></div>
        <PlayerList room={room} />
        <p className="error" role="alert">{error}</p>
        <div className="grow" />
        {room.host && backend.addPracticeBuddy && <button className="btn ghost" onClick={() => act(() => backend.addPracticeBuddy!())}>🤖 Add a practice buddy</button>}
        {room.host
          ? <button className="btn primary" disabled={room.players.length < room.minPlayers} onClick={() => act(() => backend.startRoom())}>{room.players.length < room.minPlayers ? 'Waiting for friends...' : 'Deal the cards!'}</button>
          : <p className="hint">Waiting for the host to deal...</p>}
      </GameFrame>
    );
  }

  if (!view) return <GameFrame title="ODIN" onExit={leave}><div className="spinner" /></GameFrame>;

  if (view.state === 'done') {
    const won = view.players.find((p) => p.me)?.name === view.winner;
    return (
      <GameFrame title="ODIN" onExit={leave}>
        <div className="grow" />
        <div className="soon-icon" aria-hidden>{won ? '🏆' : '🎉'}</div>
        <h3 className="center-text">{won ? 'You won!' : `${view.winner ?? 'Someone'} won!`}</h3>
        <p className="hint">{won ? 'You played your last card!' : 'Good game! Ready for another round?'}</p>
        <div className="grow" />
        <button className="btn primary" onClick={leave}>Back to the Arcade</button>
      </GameFrame>
    );
  }

  const cols = handColumns(view.hand.length);
  const play = (card: string, color?: string) => act(async () => { setPickFor(null); await backend.odinMove(card, color); });
  const current = view.players.find((p) => p.turn);
  return (
    <GameFrame title="ODIN" onExit={leave} right={<ChatButton />}>
      <div className="orivals" aria-label="Players">
        {view.players.map((p) => (
          <div key={p.name} className={`orival${p.turn ? ' turn' : ''}${p.me ? ' me' : ''}${p.left ? ' gone' : ''}`}>
            <HeroArt id={p.starter} className="chip-hero" />
            <span>{p.me ? 'You' : p.name.split(' ')[0]}</span>
            <b aria-label={`${p.cards} cards`}>🂠 {p.cards}</b>
          </div>
        ))}
      </div>
      <div className="otable">
        <div className="opile">
          <Card card={view.top} />
          <div className={`ocolor c-${view.color}`} aria-label={`Colour to match: ${COLOR_NAMES[view.color]}`}>{COLOR_NAMES[view.color]}</div>
        </div>
        <div className="oinfo">
          <p className={`oturn${view.myTurn ? ' mine' : ''}`} role="status">
            {view.myTurn ? '🟢 Your turn!' : current ? `${current.name.split(' ')[0]}'s turn…` : ''}
          </p>
          <div className="rush-timer" aria-label={`${view.secondsLeft} seconds left`}>
            <i style={{ width: `${Math.min(100, (view.secondsLeft / 45) * 100)}%` }} />
          </div>
          <button className="btn" disabled={!view.myTurn} onClick={() => act(() => backend.odinMove(null))}>🂠 Draw a card</button>
        </div>
      </div>
      <p className="error" role="alert">{error}</p>
      <div className="ohand" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }} aria-label="Your cards">
        {view.hand.map((c, i) => {
          const ok = view.myTurn && playable(c, view.top, view.color);
          return <Card key={`${c}-${i}`} card={c} dim={!ok} onClick={() => { if (!ok) return; if (isWild(c)) setPickFor(c); else play(c); }} />;
        })}
      </div>
      {pickFor && (
        <div className="opicker" role="dialog" aria-label="Pick a colour">
          <div className="card">
            <h3>Pick a colour</h3>
            <div className="opick-grid">
              {ODIN_COLORS.map((c) => <button key={c} className={`ocolor c-${c}`} onClick={() => play(pickFor, c)}>{COLOR_NAMES[c]}</button>)}
            </div>
            <button className="btn ghost" onClick={() => setPickFor(null)}>Cancel</button>
          </div>
        </div>
      )}
    </GameFrame>
  );
}
