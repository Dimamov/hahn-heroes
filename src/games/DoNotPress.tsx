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
    // Ask for full screen while the tap still counts as a gesture. iPhones may refuse; the overlay below fills the screen anyway.
    try { void document.documentElement.requestFullscreen?.().catch(() => undefined); } catch { /* not supported */ }
    const ms = siren(3) || 3000;
    timer.current = window.setTimeout(() => { setPhase('video'); busy.current = false; }, ms);
  };

  const closeVideo = () => {
    setPhase('idle');
    try { if (document.fullscreenElement) void document.exitFullscreen(); } catch { /* ignore */ }
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
        <div className="dnp-full" role="dialog" aria-label="Surprise video">
          <iframe title="Surprise" src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&playsinline=1&rel=0&fs=1" allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
          <button className="btn dnp-close" onClick={closeVideo}>✕ Close</button>
        </div>
      )}
      <div className="grow" />
    </GameFrame>
  );
}
