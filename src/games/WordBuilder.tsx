import { useMemo, useRef, useState } from 'react';
import { GameFrame, WinPanel } from './GameFrame.tsx';
import { beep } from '../lib/sound.ts';
import { burst, centerOf, popup, shake } from '../lib/fx.ts';
import puzzles from '../../content/word-builder.json';

interface Puzzle { letters: string; word: string; words: string[] }
const PUZZLES = puzzles as Puzzle[];
const GOAL = 6;
const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);

const pick = () => PUZZLES[Math.floor(Math.random() * PUZZLES.length)];

export function WordBuilder() {
  const [puzzle, setPuzzle] = useState<Puzzle>(pick);
  const valid = useMemo(() => new Set(puzzle.words), [puzzle]);
  const [tiles, setTiles] = useState<string[]>(() => shuffle(puzzle.letters.split('')));
  const [picked, setPicked] = useState<number[]>([]);
  const [found, setFound] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [won, setWon] = useState(false);
  const [hint, setHint] = useState<{ word: string; shown: number } | null>(null);
  const slots = useRef<HTMLDivElement>(null);

  const reset = () => {
    const next = pick();
    setPuzzle(next); setTiles(shuffle(next.letters.split(''))); setPicked([]); setFound([]); setMsg(''); setWon(false); setHint(null);
  };
  const reshuffle = () => { setTiles(shuffle(tiles)); setPicked([]); };

  /** Each tap shows one more letter of a word you have not found yet. A new word starts once you find it. */
  const askHint = () => {
    if (hint && !found.includes(hint.word)) { setHint({ word: hint.word, shown: Math.min(hint.shown + 1, hint.word.length - 1) }); return; }
    const open = puzzle.words.filter((w) => !found.includes(w) && w.length <= 5);
    const pool = open.length ? open : puzzle.words.filter((w) => !found.includes(w));
    if (!pool.length) return;
    setHint({ word: pool[Math.floor(Math.random() * pool.length)], shown: 1 });
  };
  const hintText = hint && !found.includes(hint.word) ? hint.word.split('').map((c, i) => (i < hint.shown ? c.toUpperCase() : '_')).join(' ') : '';

  const word = picked.map((i) => tiles[i]).join('');
  const submit = () => {
    if (word.length < 3) { setMsg('Use at least 3 letters.'); return; }
    if (found.includes(word)) { setMsg('You already found that one!'); setPicked([]); return; }
    if (!valid.has(word)) { setMsg("That's not in my word list. Try another!"); setPicked([]); beep(150, 250, 'sawtooth'); shake(slots.current, 6); return; }
    const next = [...found, word];
    setFound(next); setPicked([]); setMsg(word === puzzle.word ? 'Wow, you found the big word!' : 'Nice!');
    beep(660, 200, 'triangle');
    const c = centerOf(slots.current);
    burst(c.x, c.y, '#22d3ee', 16, 90); popup(c.x, c.y, word === puzzle.word ? 'BIG WORD! +1' : `+${word.length}`, '#fbbf24', word === puzzle.word);
    if (next.length >= GOAL) setWon(true);
  };

  if (won) return <GameFrame title="Word Builder"><WinPanel game="word-builder" message={`You built ${found.length} words!`} onAgain={reset} /></GameFrame>;
  return (
    <GameFrame title="Word Builder" hint={`Build ${GOAL} words from these letters (3 or more letters).`}>
      {hintText && <p className="note focus" role="status" aria-label="Hint">💡 Try a word like: <b>{hintText}</b></p>}
      <div className="wb-slots" ref={slots} aria-live="polite">{word || <span className="muted">Tap letters</span>}</div>
      <p className="note" role="status">{msg || `${found.length} of ${GOAL} found`}</p>
      <div className="wb-tiles">
        {tiles.map((t, i) => (
          <button key={i} className={`wb-tile${picked.includes(i) ? ' used' : ''}`} disabled={picked.includes(i)} onClick={() => setPicked([...picked, i])}>{t}</button>
        ))}
      </div>
      <div className="row wb-actions">
        <button className="btn small" onClick={reshuffle}>🔀 Shuffle</button>
        <button className="btn small" onClick={() => setPicked(picked.slice(0, -1))} disabled={!picked.length}>⌫</button>
        <button className="btn small" onClick={askHint}>💡 Hint</button>
        <button className="btn small primary" onClick={submit} disabled={!picked.length}>Enter</button>
      </div>
      <div className="chips found-words">{found.map((w) => <span className="chip chosen" key={w}>{w}</span>)}</div>
    </GameFrame>
  );
}
