import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../App.tsx';
import { GameFrame } from './GameFrame.tsx';
import { ChatButton } from './ChatBox.tsx';
import { PlayerList } from './TriviaClash.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import type { RoomState, ShadowView } from '../lib/backend.ts';
import { SPY_EMOJI } from '../lib/spy.ts';
import { isCaught, newRound, tallyVotes, type Round } from '../lib/shadow-rules.ts';

const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : '';
  if (m.includes('no room')) return "There's no waiting room with that code.";
  if (m.includes('other grade')) return 'That room is for the other grade.';
  if (m.includes('full')) return 'That room is full.';
  if (m.includes('already started')) return 'That game already started.';
  if (m.includes('at least 3')) return 'You need at least 3 players for this one.';
  if (m.includes('at least')) return 'You need more players to start.';
  if (m.includes('one word')) return 'Use just one word, with letters only.';
  if (m.includes('different word')) return 'Pick a different word.';
  if (m.includes('gives it away')) return 'Careful! That gives the secret word away.';
  if (m.includes('not your turn')) return "It's not your turn yet.";
  return "That didn't work. Please try again.";
};

/** Shadow Signal: one player is the Shadow and doesn't know the secret word. Give clues, then vote them out. */
export function ShadowSignal({ emoji = false }: { emoji?: boolean }) {
  const [mode, setMode] = useState<'online' | 'local' | null>(emoji ? 'online' : null);
  if (mode === 'local') return <ShadowLocal onExit={() => setMode(null)} />;
  if (mode === 'online') return <ShadowOnline emoji={emoji} onExit={() => setMode(null)} />;
  return (
    <GameFrame title="Shadow Signal" hint="One of you is the Shadow and doesn't know the secret word. Give clues that prove you know it, without making it too easy, then vote!">
      <div className="grow" />
      <button className="btn primary" onClick={() => setMode('online')}>🌐 Play with friends in a room</button>
      <button className="btn" onClick={() => setMode('local')}>📱 Pass the device around</button>
      <p className="hint">Rooms need 3 to 6 players from your grade. Passing one device works with 3 to 6 people sitting together.</p>
    </GameFrame>
  );
}

function ShadowOnline({ onExit, emoji = false }: { onExit: () => void; emoji?: boolean }) {
  const title = emoji ? 'Shadow Spy' : 'Shadow Signal';
  const { backend, go, refresh } = useSession();
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [view, setView] = useState<ShadowView | null>(null);
  const [typed, setTyped] = useState('');
  const [clue, setClue] = useState('');
  const [error, setError] = useState('');
  const busy = useRef(false);

  useEffect(() => { backend.currentRoom().then(setCode).catch(() => setCode(null)); }, [backend]);

  const poll = useCallback(async (c: string) => {
    try {
      const r = await backend.roomState(c);
      setRoom(r);
      if (r.state === 'playing' || r.state === 'done') setView(await backend.shadowView(c));
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

  if (code === undefined) return <GameFrame title={title}><div className="spinner" /></GameFrame>;

  if (!code || !room) {
    return (
      <GameFrame title={title} onExit={onExit}>
        <div className="grow" />
        <button className="btn primary" onClick={() => act(async () => setCode(await backend.createRoom('shadow-signal')))}>🏠 Host a room</button>
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
    const enough = room.players.length >= 3;
    return (
      <GameFrame title={title} onExit={leave} right={<ChatButton />}>
        <p className="hint">Tell your friends this code (you need 3 to 6 players):</p>
        <div className="big-code"><b>{room.code}</b></div>
        <PlayerList room={room} />
        <p className="error" role="alert">{error}</p>
        <div className="grow" />
        {room.host && backend.addPracticeBuddy && <button className="btn ghost" onClick={() => act(() => backend.addPracticeBuddy!())}>🤖 Add a practice buddy</button>}
        {room.host
          ? <button className="btn primary" disabled={!enough} onClick={() => act(() => backend.startRoom())}>{enough ? 'Start the game!' : 'Waiting for friends...'}</button>
          : <p className="hint">Waiting for the host to start...</p>}
      </GameFrame>
    );
  }

  if (!view) return <GameFrame title={title} onExit={leave}><div className="spinner" /></GameFrame>;
  const me = view.players.find((p) => p.me)!;

  if (view.phase === 'done' && view.result) {
    const shadow = view.players.find((p) => p.shadow);
    const iWon = view.isShadow ? view.result.shadowWon : !view.result.shadowWon;
    return (
      <GameFrame title={title} onExit={leave}>
        <div className="soon-icon" aria-hidden>{iWon ? '🏆' : '🎭'}</div>
        <h3 className="center-text">{iWon ? 'Your side won!' : 'Your side lost this one.'}</h3>
        <p className="hint">
          The Shadow was <b>{shadow?.name}</b>. The secret word was <b>{view.result.word}</b>.{' '}
          {!view.result.caught ? 'The Shadow was not caught!' : view.result.shadowWon ? 'The Shadow was caught but guessed the word!' : 'The Shadow was caught and missed the word.'}
        </p>
        <div className="players">
          {view.players.map((p) => (
            <div key={p.i} className={`card member${p.me ? ' me' : ''}`}>
              <HeroArt id={p.starter} className="chip-hero" />
              <span><b>{p.name}</b> {p.shadow && '🕵️'}</span>
              <span>{p.votes ?? 0} votes</span>
            </div>
          ))}
        </div>
        <div className="grow" />
        <button className="btn primary" onClick={leave}>Back to the Arcade</button>
      </GameFrame>
    );
  }

  const myTurn = view.phase === 'clue' && me.speaking;
  const speaker = view.players.find((p) => p.speaking);
  return (
    <GameFrame title={title} onExit={leave} right={<ChatButton />}>
      <RoleCard category={view.category} shadow={view.isShadow} word={view.word} />
      <div className="rush-timer" aria-label={`${view.secondsLeft} seconds left`}>
        <i style={{ width: `${view.seconds ? Math.min(100, (view.secondsLeft / view.seconds) * 100) : 0}%` }} />
      </div>
      {view.phase !== 'guess' && <div className="players sslist">
        {view.players.map((p) => (
          <div key={p.i} className={`card member${p.me ? ' me' : ''}${p.speaking ? ' speaking' : ''}`}>
            <HeroArt id={p.starter} className="chip-hero" />
            <span><b>{p.me ? 'You' : p.name}</b></span>
            <em className="sclue">{p.clue === null ? (p.speaking ? '…' : '') : p.clue === '' ? '— (skipped)' : `“${p.clue}”`}{view.phase === 'vote' && p.voted ? ' ✔' : ''}</em>
          </div>
        ))}
      </div>}
      {view.phase === 'clue' && (myTurn ? (
        emoji ? (
          <div className="spy-grid" role="group" aria-label="Pick an emoji clue">
            {SPY_EMOJI.map((e) => <button key={e} className="spy-emoji" onClick={() => act(() => backend.shadowClue(e))}>{e}</button>)}
          </div>
        ) : <form className="choice-edit" onSubmit={(e) => { e.preventDefault(); if (clue.trim()) act(async () => { await backend.shadowClue(clue.trim()); setClue(''); }); }}>
          <input aria-label="Your one word clue" value={clue} maxLength={16} autoCapitalize="none" autoComplete="off" placeholder="One word clue" onChange={(e) => setClue(e.target.value)} />
          <button className="btn primary" disabled={!clue.trim()}>Send</button>
        </form>
      ) : <p className="note">{speaker ? `${speaker.name.split(' ')[0]} is thinking of a clue…` : ''}</p>)}
      {view.phase === 'vote' && (
        <>
          <p className="note">Who is the Shadow? Tap to vote.</p>
          <div className="vote-grid">
            {view.players.filter((p) => !p.me).map((p) => (
              <button key={p.i} className={`chip${view.myVote === p.i ? ' chosen' : ''}`} onClick={() => act(() => backend.shadowVote(p.i))}>{p.name}</button>
            ))}
          </div>
        </>
      )}
      {view.phase === 'guess' && (view.isShadow && view.options ? (
        <>
          <p className="note">You were caught! Guess the secret word to still win.</p>
          <div className="vote-grid">
            {view.options.map((w) => <button key={w} className="chip" onClick={() => act(() => backend.shadowGuess(w))}>{w}</button>)}
          </div>
        </>
      ) : <p className="note">The Shadow was caught and is guessing the word…</p>)}
      <p className="error" role="alert">{error}</p>
    </GameFrame>
  );
}

function RoleCard({ category, shadow, word }: { category: string; shadow: boolean; word: string | null }) {
  return shadow
    ? <div className="rolecard shadow"><b>🕵️ You are the Shadow!</b><span>Category: <u>{category}</u>. Blend in without knowing the word.</span></div>
    : <div className="rolecard"><b>🔒 Secret word: {word}</b><span>Category: {category}. Hint at it without giving it away.</span></div>;
}

type Stage =
  | { k: 'setup' }
  | { k: 'pass'; i: number }
  | { k: 'card'; i: number }
  | { k: 'talk' }
  | { k: 'votepass'; i: number }
  | { k: 'vote'; i: number }
  | { k: 'guesspass' }
  | { k: 'guess' }
  | { k: 'result'; guess: string | null };

/** One device, passed around the table. Nothing is sent anywhere. */
function ShadowLocal({ onExit }: { onExit: () => void }) {
  const [n, setN] = useState(4);
  const [round, setRound] = useState<Round | null>(null);
  const [stage, setStage] = useState<Stage>({ k: 'setup' });
  const [votes, setVotes] = useState<Record<number, number>>({});
  const [starter, setStarter] = useState(0);
  const name = (i: number) => `Player ${i + 1}`;

  const start = () => { setRound(newRound(n)); setVotes({}); setStarter(Math.floor(Math.random() * n)); setStage({ k: 'pass', i: 0 }); };
  const exit = onExit;

  if (stage.k === 'setup' || !round) {
    return (
      <GameFrame title="Pass the device" onExit={exit} hint="Everyone sits together. Each person secretly looks at their card, then you say clues out loud.">
        <div className="grow" />
        <p className="center-text"><b>How many players?</b></p>
        <div className="stepper">
          <button className="btn" aria-label="Fewer players" disabled={n <= 3} onClick={() => setN(n - 1)}>−</button>
          <b className="stepper-n">{n}</b>
          <button className="btn" aria-label="More players" disabled={n >= 6} onClick={() => setN(n + 1)}>+</button>
        </div>
        <div className="grow" />
        <button className="btn primary" onClick={start}>Deal the secret cards</button>
      </GameFrame>
    );
  }

  const shadowIdx = round.shadow;
  switch (stage.k) {
    case 'pass':
      return (
        <GameFrame title="Pass the device" onExit={exit}>
          <div className="grow" />
          <div className="soon-icon" aria-hidden>📱</div>
          <h3 className="center-text">Pass to {name(stage.i)}</h3>
          <p className="hint">Make sure nobody else is looking!</p>
          <div className="grow" />
          <button className="btn primary" onClick={() => setStage({ k: 'card', i: stage.i })}>I'm {name(stage.i)}. Show my card</button>
        </GameFrame>
      );
    case 'card':
      return (
        <GameFrame title={name(stage.i)} onExit={exit}>
          <div className="grow" />
          <RoleCard category={round.category} shadow={stage.i === shadowIdx} word={round.word} />
          <div className="grow" />
          <button className="btn primary" onClick={() => setStage(stage.i + 1 >= n ? { k: 'talk' } : { k: 'pass', i: stage.i + 1 })}>
            {stage.i + 1 >= n ? 'Hide my card' : 'Hide and pass on'}
          </button>
        </GameFrame>
      );
    case 'talk':
      return (
        <GameFrame title="Give clues" onExit={exit}>
          <div className="grow" />
          <div className="soon-icon" aria-hidden>💬</div>
          <h3 className="center-text">{name(starter)} goes first</h3>
          <p className="hint">Going around the table, everyone says one word that hints at the secret word. The Shadow has to bluff! When everyone has spoken, it's time to vote.</p>
          <div className="grow" />
          <button className="btn primary" onClick={() => setStage({ k: 'votepass', i: 0 })}>Start voting</button>
        </GameFrame>
      );
    case 'votepass':
      return (
        <GameFrame title="Vote" onExit={exit}>
          <div className="grow" />
          <div className="soon-icon" aria-hidden>🗳️</div>
          <h3 className="center-text">{name(stage.i)}, your vote</h3>
          <p className="hint">Pass the device and vote in secret.</p>
          <div className="grow" />
          <button className="btn primary" onClick={() => setStage({ k: 'vote', i: stage.i })}>I'm ready to vote</button>
        </GameFrame>
      );
    case 'vote':
      return (
        <GameFrame title={`${name(stage.i)}: who is the Shadow?`} onExit={exit}>
          <div className="vote-grid">
            {Array.from({ length: n }, (_, k) => k).filter((k) => k !== stage.i).map((k) => (
              <button key={k} className="chip" onClick={() => {
                const next = { ...votes, [stage.i]: k };
                setVotes(next);
                if (stage.i + 1 < n) setStage({ k: 'votepass', i: stage.i + 1 });
                else setStage(isCaught(next, shadowIdx) ? { k: 'guesspass' } : { k: 'result', guess: null });
              }}>{name(k)}</button>
            ))}
          </div>
        </GameFrame>
      );
    case 'guesspass':
      return (
        <GameFrame title="Caught!" onExit={exit}>
          <div className="grow" />
          <div className="soon-icon" aria-hidden>🕵️</div>
          <h3 className="center-text">{name(shadowIdx)} was the Shadow!</h3>
          <p className="hint">They were caught, but they can still win by guessing the secret word. Pass them the device.</p>
          <div className="grow" />
          <button className="btn primary" onClick={() => setStage({ k: 'guess' })}>I'm the Shadow. Let me guess</button>
        </GameFrame>
      );
    case 'guess':
      return (
        <GameFrame title="Guess the word" onExit={exit} hint={`The category is ${round.category}.`}>
          <div className="vote-grid">
            {round.options.map((w) => <button key={w} className="chip" onClick={() => setStage({ k: 'result', guess: w })}>{w}</button>)}
          </div>
        </GameFrame>
      );
    default: {
      const caught = isCaught(votes, shadowIdx);
      const shadowWon = !caught || stage.guess === round.word;
      const tally = tallyVotes(votes, n);
      return (
        <GameFrame title="Shadow Signal" onExit={exit}>
          <div className="soon-icon" aria-hidden>{shadowWon ? '🎭' : '🏆'}</div>
          <h3 className="center-text">{shadowWon ? 'The Shadow wins!' : 'The crew wins!'}</h3>
          <p className="hint">
            {name(shadowIdx)} was the Shadow. The word was <b>{round.word}</b>.{' '}
            {!caught ? 'Nobody caught them!' : stage.guess === round.word ? 'They were caught but guessed the word!' : `They were caught and guessed “${stage.guess}”.`}
          </p>
          <div className="players">
            {tally.map((v, k) => <div key={k} className="card member"><span><b>{name(k)}</b> {k === shadowIdx && '🕵️'}</span><span>{v} votes</span></div>)}
          </div>
          <div className="grow" />
          <button className="btn primary" onClick={start}>Play again</button>
          <button className="btn ghost" onClick={exit}>Back</button>
        </GameFrame>
      );
    }
  }
}
