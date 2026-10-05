import { useEffect, useRef, useState } from 'react';
import { GameFrame } from './GameFrame.tsx';
import { useSession } from '../App.tsx';
import { siren } from '../lib/sound.ts';

/** The warning button. The siren can never stack: taps are ignored while it is sounding. */
export function DoNotPress() {
  const [phase, setPhase] = useState<'idle' | 'siren' | 'video'>('idle');
  const { go } = useSession();
  const busy = useRef(false);
  const timer = useRef<number>(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const press = () => {
    if (busy.current) return;
    busy.current = true;
    setPhase('siren');
    const ms = siren(3) || 3000;
    timer.current = window.setTimeout(() => { setPhase('video'); busy.current = false; }, ms);
  };

  return (
    <GameFrame title="Do Not Press" hint={phase === 'idle' ? 'Seriously. Do not press the button.' : undefined} onExit={() => go('home')}>
      <div className="grow" />
      {phase !== 'video' && (
        <button className={`bigred${phase === 'siren' ? ' alarm' : ''}`} onClick={press} aria-label="Do not press">
          {phase === 'siren' ? '🚨' : 'DO NOT PRESS'}
        </button>
      )}
      {phase === 'siren' && <p className="hint">Uh oh...</p>}
      {phase === 'video' && (
        <>
          <p className="hint">You were warned! 🎶</p>
          <div className="video-wrap">
            <iframe title="Surprise" src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0" allow="autoplay; encrypted-media" allowFullScreen />
          </div>
          <button className="btn" onClick={() => setPhase('idle')}>Close</button>
        </>
      )}
      <div className="grow" />
    </GameFrame>
  );
}
