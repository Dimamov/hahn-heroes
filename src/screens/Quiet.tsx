import { useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { isQuiet, setQuiet } from '../lib/sound.ts';

const WORDS: [string, string][] = [
  ['planet', 'Earth is one of these'], ['journey', 'a long trip'], ['whisper', 'to speak very softly'], ['curious', 'wanting to know more'],
  ['gentle', 'soft and kind'], ['bridge', 'you cross a river on it'], ['thunder', 'the loud sound after lightning'], ['harvest', 'gathering crops from a farm'],
  ['wonder', 'to be amazed or to ask yourself'], ['pattern', 'shapes or numbers that repeat'], ['balance', 'staying steady without falling'], ['library', 'a place full of books'],
  ['mystery', 'something hard to explain'], ['courage', 'being brave'], ['explore', 'to travel and discover'], ['feather', 'it covers a bird'],
  ['kingdom', 'land ruled by a king or queen'], ['ocean', 'a huge body of salt water'], ['silence', 'no sound at all'], ['treasure', 'gold and jewels in a chest'],
  ['volcano', 'a mountain that can erupt'], ['compass', 'it shows which way is north'], ['rainbow', 'colors in the sky after rain'], ['lantern', 'a light you can carry'],
  ['meadow', 'a grassy field'], ['puzzle', 'a game you solve'], ['shelter', 'a place to stay safe'], ['glacier', 'a slow river of ice'],
];
const shuffle = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const scramble = (w: string) => { let s = w; for (let n = 0; n < 5 && s === w; n++) s = shuffle(w.split('')).join(''); return s; };
const order = () => shuffle(WORDS.map((_, i) => i));

/** Quiet time: sounds and effects off, no timers and no scores. Word puzzles and calm reading. */
export function Quiet() {
  const { go } = useSession();
  const [on, setOn] = useState(isQuiet());
  const [mode, setMode] = useState<'menu' | 'puzzle'>('menu');
  const [seq] = useState(order);
  const [n, setN] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [hint, setHint] = useState(false);
  const [tiles, setTiles] = useState(() => scramble(WORDS[seq[0]][0]));

  const toggle = () => { setQuiet(!on); setOn(!on); };
  const [word, clue] = WORDS[seq[n % seq.length]];
  const built = picked.map((i) => tiles[i]).join('');
  const solved = built === word;
  const next = () => { const k = (n + 1) % seq.length; setN(n + 1); setPicked([]); setHint(false); setTiles(scramble(WORDS[seq[k]][0])); };

  if (mode === 'puzzle') {
    return (
      <main className="screen live quiet">
        <ScreenBar title="Word puzzle" onBack={() => setMode('menu')} />
        <div className="live-join">
          <p className="hint">Tap the letters in the right order to make a word.</p>
          <div className="quiet-slots" aria-label="Your word">{word.split('').map((_, i) => <span key={i} className={`quiet-slot${picked[i] != null ? ' full' : ''}`}>{picked[i] != null ? tiles[picked[i]] : ''}</span>)}</div>
          <div className="quiet-tiles">
            {tiles.split('').map((ch, i) => <button key={i} className="quiet-tile" disabled={picked.includes(i) || solved} onClick={() => setPicked([...picked, i])}>{ch}</button>)}
          </div>
          {solved
            ? <><h3>✨ {word}!</h3><button className="btn primary big" onClick={next}>Next word</button></>
            : <div className="btn-grid">
                <button className="btn ghost" disabled={picked.length === 0} onClick={() => setPicked(picked.slice(0, -1))}>⌫ Undo</button>
                <button className="btn ghost" onClick={() => setHint(true)}>💡 Clue</button>
              </div>}
          {hint && !solved && <p className="note">{clue}</p>}
          {!solved && picked.length === word.length && <p className="note">Not quite. Tap Undo and try again.</p>}
        </div>
      </main>
    );
  }
  return (
    <main className="screen live quiet">
      <ScreenBar title="Quiet time" onBack={() => go('home')} />
      <div className="live-join">
        <div className="soon-icon" aria-hidden>🤫</div>
        <p className="hint">Calm activities with no sound, no timers and no scores.</p>
        <button className={`btn ${on ? 'primary' : ''} big`} onClick={toggle}>{on ? '🔇 Quiet mode is ON' : '🔔 Turn quiet mode on'}</button>
        <p className="note">{on ? 'Sounds and effects stay off until you turn it off or close the app.' : 'Switches off sounds and effects across the app.'}</p>
        <button className="btn big" onClick={() => setMode('puzzle')}>🔤 Word puzzle</button>
        <button className="btn big" onClick={() => go('practice:reading')}>📖 Calm reading</button>
      </div>
    </main>
  );
}
