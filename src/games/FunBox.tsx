import { useRef, useState } from 'react';
import { GameFrame } from './GameFrame.tsx';
import box from '../../content/funbox.json';

type Kind = 'joke' | 'riddle' | 'fortune' | 'fact' | 'cheer' | 'teaser' | 'tongue' | 'would';
/** `a` is the punchline or answer; it stays hidden until the hero taps to reveal it. */
type Item = { k: Kind; t: string; a?: string };
const ITEMS = box as Item[];
const LABEL: Record<Kind, string> = {
  joke: '😂 Joke', riddle: '🧩 Riddle', fortune: '🔮 Fortune', fact: '🤓 Did you know?', cheer: '💪 Cheer',
  teaser: '🧠 Brain teaser', tongue: '👅 Tongue twister', would: '🤔 Would you rather?',
};
const HINT: Partial<Record<Kind, string>> = { tongue: 'Say it three times fast!', would: 'Pick one and tell a friend why.' };
const shuffled = () => [...ITEMS].sort(() => Math.random() - 0.5);

export function FunBox() {
  // A shuffled deck, so nothing repeats until every item has been shown.
  const deck = useRef<Item[]>(shuffled());
  const [item, setItem] = useState<Item | null>(null);
  const [shown, setShown] = useState(false);
  const draw = () => {
    if (!deck.current.length) deck.current = shuffled();
    setItem(deck.current.pop()!);
    setShown(false);
  };
  return (
    <GameFrame title="Fun Box" hint="Tap the box for a joke, riddle, brain teaser, tongue twister or fun fact.">
      <div className="grow" />
      <button className="funbox" onClick={draw} aria-label="Open the Fun Box">{item ? '🎁' : '📦'}</button>
      {item && (
        <div className="card fun-card" role="status" key={item.t}>
          <small className="muted">{LABEL[item.k]}</small>
          <p>{item.t}</p>
          {item.a && (shown
            ? <p className="fun-answer">{item.a}</p>
            : <button className="btn small ghost" onClick={() => setShown(true)}>{item.k === 'joke' ? 'Tell me!' : 'Show the answer'}</button>)}
          {HINT[item.k] && <small className="muted">{HINT[item.k]}</small>}
        </div>
      )}
      <div className="grow" />
      <button className="btn primary" onClick={draw}>{item ? 'Another one!' : 'Open the box'}</button>
    </GameFrame>
  );
}
