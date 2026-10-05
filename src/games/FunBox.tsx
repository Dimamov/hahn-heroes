import { useRef, useState } from 'react';
import { GameFrame } from './GameFrame.tsx';
import box from '../../content/funbox.json';

type Item = { k: 'joke' | 'riddle' | 'fortune' | 'fact' | 'cheer'; t: string };
const ITEMS = box as Item[];
const LABEL: Record<Item['k'], string> = { joke: '😂 Joke', riddle: '🧩 Riddle', fortune: '🔮 Fortune', fact: '🤓 Did you know?', cheer: '💪 Cheer' };
const shuffled = () => [...ITEMS].sort(() => Math.random() - 0.5);

export function FunBox() {
  // A shuffled deck, so nothing repeats until every item has been shown.
  const deck = useRef<Item[]>(shuffled());
  const [item, setItem] = useState<Item | null>(null);
  const draw = () => {
    if (!deck.current.length) deck.current = shuffled();
    setItem(deck.current.pop()!);
  };
  return (
    <GameFrame title="Fun Box" hint="Tap the box for a joke, riddle, fortune or fun fact.">
      <div className="grow" />
      <button className="funbox" onClick={draw} aria-label="Open the Fun Box">{item ? '🎁' : '📦'}</button>
      {item && (
        <div className="card fun-card" role="status" key={item.t}>
          <small className="muted">{LABEL[item.k]}</small>
          <p>{item.t}</p>
        </div>
      )}
      <div className="grow" />
      <button className="btn primary" onClick={draw}>{item ? 'Another one!' : 'Open the box'}</button>
    </GameFrame>
  );
}
