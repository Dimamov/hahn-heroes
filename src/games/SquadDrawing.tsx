import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../App.tsx';
import { GameFrame } from './GameFrame.tsx';
import { ChatButton } from './ChatBox.tsx';
import { PlayerList } from './TriviaClash.tsx';
import type { DrawingView, RoomState } from '../lib/backend.ts';
import { CANVAS, PEN_COLORS, PEN_WIDTHS, type DrawStroke } from '../lib/drawing-rules.ts';

const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : '';
  if (m.includes('no room')) return "There's no waiting room with that code.";
  if (m.includes('other grade')) return 'That room is for the other grade.';
  if (m.includes('full')) return 'That room is full.';
  if (m.includes('already started')) return 'That game already started.';
  if (m.includes('at least')) return 'You need at least 2 players to start.';
  if (m.includes('letters only')) return 'Use letters only.';
  if (m.includes('different word')) return 'Pick a different word.';
  if (m.includes('slow down')) return 'Slow down a little!';
  if (m.includes('round is over')) return 'That round just ended.';
  return "That didn't work. Please try again.";
};

function paint(canvas: HTMLCanvasElement, strokes: DrawStroke[]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS, CANVAS);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    ctx.strokeStyle = s.c;
    ctx.fillStyle = s.c;
    ctx.lineWidth = s.w;
    if (s.p.length === 1) { ctx.beginPath(); ctx.arc(s.p[0][0], s.p[0][1], s.w / 2, 0, Math.PI * 2); ctx.fill(); continue; }
    ctx.beginPath();
    ctx.moveTo(s.p[0][0], s.p[0][1]);
    for (const [x, y] of s.p.slice(1)) ctx.lineTo(x, y);
    ctx.stroke();
  }
}

/** Squad Drawing: take turns drawing a secret word while the rest of the squad guesses. */
export function SquadDrawing() {
  const { backend, go, refresh } = useSession();
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [view, setView] = useState<DrawingView | null>(null);
  const [typed, setTyped] = useState('');
  const [guess, setGuess] = useState('');
  const [error, setError] = useState('');
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [width, setWidth] = useState(PEN_WIDTHS[0]);
  const [reported, setReported] = useState(false);
  const busy = useRef(false);
  const known = useRef<DrawStroke[]>([]);
  const roundKey = useRef('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pending = useRef<[number, number][]>([]);
  const drawing = useRef<{ id: number; color: string; width: number } | null>(null);
  const nextId = useRef(1);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => { backend.currentRoom().then(setCode).catch(() => setCode(null)); }, [backend]);

  const poll = useCallback(async (c: string) => {
    try {
      const r = await backend.roomState(c);
      setRoom(r);
      if (r.state !== 'playing' && r.state !== 'done') return;
      const v = await backend.drawingView(c, Math.max(0, known.current.length - 1));
      const key = `${v.round}`;
      if (key !== roundKey.current) { roundKey.current = key; known.current = []; setReported(false); nextId.current = 1; if (v.isArtist) setStrokes([]); }
      if (!v.isArtist) {
        known.current = [...known.current.slice(0, v.strokesFrom), ...v.strokes];
        setStrokes(known.current);
      }
      setView(v);
    } catch { setCode(null); setRoom(null); setView(null); }
  }, [backend]);
  useEffect(() => {
    if (!code) return;
    poll(code);
    const id = setInterval(() => poll(code), 1000);
    return () => clearInterval(id);
  }, [code, poll]);
  useEffect(() => { if (room?.state === 'done') refresh().catch(() => undefined); }, [room?.state, refresh]);
  useEffect(() => { if (canvasRef.current) paint(canvasRef.current, strokes); }, [strokes, view?.state]);

  // The artist sends new points about every quarter second while drawing.
  const flush = useCallback(() => {
    const pen = drawing.current;
    if (!pen || !pending.current.length) return;
    const points = pending.current.splice(0, 150);
    queue.current = queue.current.then(() => backend.drawingStroke(pen.id, pen.color, pen.width, points)).catch(() => undefined);
    if (pending.current.length) flush();
  }, [backend]);
  useEffect(() => { const id = setInterval(flush, 250); return () => clearInterval(id); }, [flush]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clamp = (n: number) => Math.max(0, Math.min(CANVAS, Math.round(n)));
    return [clamp(((e.clientX - rect.left) / rect.width) * CANVAS), clamp(((e.clientY - rect.top) / rect.height) * CANVAS)];
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!view?.isArtist || view.phase !== 'draw') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const id = nextId.current++;
    drawing.current = { id, color, width };
    const p = point(e);
    pending.current = [p];
    setStrokes((s) => [...s, { id, c: color, w: width, p: [p] }]);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pen = drawing.current;
    if (!pen) return;
    const p = point(e);
    pending.current.push(p);
    setStrokes((s) => s.map((x, i) => (i === s.length - 1 ? { ...x, p: [...x.p, p] } : x)));
  };
  const up = () => { flush(); drawing.current = null; };

  const act = async (fn: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true; setError('');
    try { await fn(); if (code) await poll(code); } catch (e) { setError(errText(e)); } finally { busy.current = false; }
  };
  const leave = async () => { await backend.leaveRoom().catch(() => undefined); setCode(null); setRoom(null); setView(null); go('arcade'); };

  if (code === undefined) return <GameFrame title="Squad Drawing"><div className="spinner" /></GameFrame>;

  if (!code || !room) {
    return (
      <GameFrame title="Squad Drawing" hint="Take turns drawing a secret word while your friends guess. You can only play with your own grade.">
        <div className="grow" />
        <button className="btn primary" onClick={() => act(async () => setCode(await backend.createRoom('squad-drawing')))}>🏠 Host a room</button>
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
      <GameFrame title="Squad Drawing" onExit={leave} right={<ChatButton />}>
        <p className="hint">Tell your friends this code. Everyone draws once!</p>
        <div className="big-code"><b>{room.code}</b></div>
        <PlayerList room={room} />
        <p className="error" role="alert">{error}</p>
        <div className="grow" />
        {room.host && backend.addPracticeBuddy && <button className="btn ghost" onClick={() => act(() => backend.addPracticeBuddy!())}>🤖 Add a practice buddy</button>}
        {room.host
          ? <button className="btn primary" disabled={room.players.length < room.minPlayers} onClick={() => act(() => backend.startRoom())}>{room.players.length < room.minPlayers ? 'Waiting for friends...' : 'Start drawing!'}</button>
          : <p className="hint">Waiting for the host to start...</p>}
      </GameFrame>
    );
  }

  if (!view) return <GameFrame title="Squad Drawing" onExit={leave}><div className="spinner" /></GameFrame>;

  if (room.state === 'done') {
    const place = view.players.findIndex((p) => p.me) + 1;
    return (
      <GameFrame title="Squad Drawing" onExit={leave}>
        <div className="soon-icon" aria-hidden>{place === 1 ? '🏆' : '🎨'}</div>
        <h3 className="center-text">{place === 1 ? 'You won!' : `You finished #${place}`}</h3>
        <div className="players">
          {view.players.map((p) => <div key={p.name} className={`card member${p.me ? ' me' : ''}`}><span><b>{p.name}</b></span><b>{p.score}</b></div>)}
        </div>
        <div className="grow" />
        <button className="btn primary" onClick={leave}>Back to the Arcade</button>
      </GameFrame>
    );
  }

  const reveal = view.phase === 'reveal';
  const label = reveal
    ? (view.voided ? 'This drawing was reported and skipped.' : `It was “${view.word}”!`)
    : view.isArtist ? `Draw: ${view.word}`
    : view.word ? `You got it! It's “${view.word}”`
    : view.pattern ? view.pattern.split('').join(' ').replace(/ {3}/g, '  /  ') : '';
  const canGuess = !view.isArtist && !view.solved && !reveal;
  return (
    <GameFrame title={`Round ${view.round + 1}/${view.rounds}`} onExit={leave} right={<ChatButton />}>
      <p className={`dwlabel${view.isArtist ? ' artist' : ''}`} role="status">{label}</p>
      <div className="rush-timer" aria-label={`${view.secondsLeft} seconds left`}>
        <i style={{ width: `${view.seconds ? Math.min(100, (view.secondsLeft / view.seconds) * 100) : 0}%` }} />
      </div>
      <div className="dwcanvas-wrap">
        <canvas ref={canvasRef} className="dwcanvas" width={CANVAS} height={CANVAS} aria-label={view.isArtist ? 'Your drawing board' : `${view.artist}'s drawing`}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      </div>
      {view.isArtist && !reveal ? (
        <div className="dwtools">
          {PEN_COLORS.map((c) => <button key={c} className={`swatch${color === c ? ' on' : ''}`} style={{ background: c }} aria-label={`Pen colour ${c}`} onClick={() => setColor(c)} />)}
          <button className={`chip${width === PEN_WIDTHS[1] ? ' chosen' : ''}`} onClick={() => setWidth(width === PEN_WIDTHS[0] ? PEN_WIDTHS[1] : PEN_WIDTHS[0])}>{width === PEN_WIDTHS[0] ? '✏️ Thin' : '🖌️ Thick'}</button>
          <button className="chip" onClick={() => act(async () => { await backend.drawingClear(); known.current = []; setStrokes([]); nextId.current += 1; })}>🗑️ Clear</button>
        </div>
      ) : (
        <>
          <div className="dwfeed" aria-label="Guesses">
            {view.guesses.slice(-3).map((g, i) => (
              <span key={i} className={g.correct ? 'ok' : ''}>{g.correct ? `✅ ${g.me ? 'You' : g.name.split(' ')[0]} got it!` : `${g.me ? 'You' : g.name.split(' ')[0]}: ${g.text}`}</span>
            ))}
          </div>
          {canGuess && (
            <form className="choice-edit" onSubmit={(e) => { e.preventDefault(); const g = guess.trim(); if (g) act(async () => { setGuess(''); await backend.drawingGuess(g); }); }}>
              <input aria-label="Your guess" value={guess} maxLength={24} autoCapitalize="none" autoComplete="off" placeholder="Type your guess" onChange={(e) => setGuess(e.target.value)} />
              <button className="btn primary" disabled={!guess.trim()}>Guess</button>
            </form>
          )}
          {!view.isArtist && !reveal && (
            <button className="btn link" disabled={reported} onClick={() => act(async () => { await backend.drawingReport(); setReported(true); })}>{reported ? '🚩 Reported. Thank you.' : '🚩 Report this drawing'}</button>
          )}
        </>
      )}
      <p className="error" role="alert">{error}</p>
      <div className="scorebar" aria-label="Scores">
        {view.players.map((p) => <span key={p.name} className={p.me ? 'me' : ''}>{p.artist ? '🎨 ' : p.solved ? '✔ ' : ''}{p.name.split(' ')[0]} {p.score}</span>)}
      </div>
    </GameFrame>
  );
}
