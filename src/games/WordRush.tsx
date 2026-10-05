import { useEffect, useState } from 'react';
import { GameFrame } from './GameFrame.tsx';
import { beep } from '../lib/sound.ts';

const CATEGORIES = [
  'Animals', 'Foods', 'Things at school', 'Countries', 'Sports', 'Jobs', 'Things in a kitchen', 'Colors of things', 'Movies or shows',
  'Things that are cold', 'Things that are round', 'Fruits or vegetables', 'Things at the beach', 'Clothes', 'Things in a backpack',
  'Superpowers', 'Things you do outside', 'Musical things', 'Things with wheels', 'Things in a park', 'Cartoon characters',
  'Things in space', 'Things in a bedroom', 'Pets', 'Drinks', 'Things you can read', 'Things that are loud', 'Things in a garden',
];
const LETTERS = 'ABCDEFGHILMNOPRSTW'.split('');
const SECONDS = 10;
const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Pass-the-device game: no server and no reward. The group judges the answers out loud. */
export function WordRush() {
  const [players, setPlayers] = useState(3);
  const [started, setStarted] = useState(false);
  const [alive, setAlive] = useState<number[]>([]);
  const [turn, setTurn] = useState(0);
  const [card, setCard] = useState({ cat: CATEGORIES[0], letter: 'A' });
  const [left, setLeft] = useState(SECONDS);
  const [out, setOut] = useState<number | null>(null);

  const newCard = () => setCard({ cat: rnd(CATEGORIES), letter: rnd(LETTERS) });
  const start = () => { setAlive(Array.from({ length: players }, (_, i) => i)); setTurn(0); setOut(null); setLeft(SECONDS); newCard(); setStarted(true); };

  const pass = () => { setTurn((t) => (t + 1) % alive.length); setLeft(SECONDS); newCard(); beep(520, 100, 'triangle'); };
  const timeUp = () => {
    beep(150, 500, 'sawtooth');
    const player = alive[turn];
    setOut(player);
    const rest = alive.filter((p) => p !== player);
    setAlive(rest);
    setTurn(rest.length ? turn % rest.length : 0);
  };

  useEffect(() => {
    if (!started || out !== null || alive.length < 2) return;
    if (left <= 0) { timeUp(); return; }
    const id = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(id);
  }, [started, out, left, alive.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!started) {
    return (
      <GameFrame title="Word Rush" hint="Pass the device around. Say a word for the category that starts with the letter before time runs out!">
        <div className="grow" />
        <p className="hint">How many players?</p>
        <div className="chips">{[2, 3, 4, 5, 6].map((n) => <button key={n} className={`chip${players === n ? ' chosen' : ''}`} onClick={() => setPlayers(n)}>{n}</button>)}</div>
        <div className="grow" />
        <button className="btn primary" onClick={start}>Start</button>
      </GameFrame>
    );
  }
  if (alive.length < 2 && out !== null) {
    return (
      <GameFrame title="Word Rush">
        <div className="grow" />
        <div className="soon-icon" aria-hidden>🏆</div>
        <h3>Player {alive[0] + 1} wins!</h3>
        <p className="hint">Player {out + 1} ran out of time.</p>
        <div className="grow" />
        <button className="btn primary" onClick={start}>Play again</button>
      </GameFrame>
    );
  }
  if (out !== null) {
    return (
      <GameFrame title="Word Rush">
        <div className="grow" />
        <div className="soon-icon" aria-hidden>⏰</div>
        <h3>Time's up, Player {out + 1}!</h3>
        <p className="hint">Player {out + 1} is out. Hand the device to Player {alive[turn] + 1}.</p>
        <div className="grow" />
        <button className="btn primary" onClick={() => { setOut(null); setLeft(SECONDS); newCard(); }}>Next round</button>
      </GameFrame>
    );
  }
  return (
    <GameFrame title="Word Rush">
      <p className="hint">Player {alive[turn] + 1}, you're up!</p>
      <div className="rush-card">
        <small>{card.cat}</small>
        <b>{card.letter}</b>
      </div>
      <div className="rush-timer" aria-label={`${left} seconds left`}><i style={{ width: `${(left / SECONDS) * 100}%` }} /></div>
      <p className="note">{left} seconds</p>
      <div className="grow" />
      <button className="btn primary" onClick={pass}>✅ I said one! Pass it on</button>
    </GameFrame>
  );
}
