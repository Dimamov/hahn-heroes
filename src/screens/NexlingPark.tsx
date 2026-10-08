import { useEffect, useRef, useState } from 'react';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { beep } from '../lib/sound.ts';
import { BEAT_MS, SCRUBS_NEEDED, SILLY_HATS, ballPos, beatOffset, danceJudge, fetchHit, FETCH_ZONE } from '../lib/nexling-games.ts';

export interface ParkPet { icon: React.ReactNode; name: string; color: string }
export type ParkGame = 'bath' | 'hats' | 'dance' | 'fetch';

export const PARK_GAMES: { id: ParkGame; label: string }[] = [
  { id: 'bath', label: '🫧 Bubble bath' },
  { id: 'hats', label: '🎩 Silly hats' },
  { id: 'dance', label: '💃 Dance party' },
  { id: 'fetch', label: '🎾 Fetch' },
];

function Done({ title, text, onAgain, onBack }: { title: string; text: string; onAgain: () => void; onBack: () => void }) {
  return (
    <main className="screen center">
      <ScreenBar title={title} onBack={onBack} />
      <div className="grow" /><div className="soon-icon" aria-hidden>🎉</div><h3>{text}</h3><div className="grow" />
      <div className="btn-grid"><button className="btn ghost" onClick={onBack}>Done</button><button className="btn primary" onClick={onAgain}>Play again</button></div>
    </main>
  );
}

/** Silly little Nexling activities in the Pet Park. Nothing here awards anything or talks to other kids. */
export function ParkActivity({ game, pet, onBack }: { game: ParkGame; pet: ParkPet; onBack: () => void }) {
  if (game === 'bath') return <Bath pet={pet} onBack={onBack} />;
  if (game === 'hats') return <Hats pet={pet} onBack={onBack} />;
  if (game === 'dance') return <Dance pet={pet} onBack={onBack} />;
  return <Fetch pet={pet} onBack={onBack} />;
}

/** Scrub your Nexling clean: wiggle a finger over it (or tap). */
function Bath({ pet, onBack }: { pet: ParkPet; onBack: () => void }) {
  const [scrubs, setScrubs] = useState(0);
  const last = useRef<number | null>(null);
  const dist = useRef(0);
  const [round, setRound] = useState(0);
  const add = () => { setScrubs((s) => s + 1); beep(500 + Math.random() * 300, 50, 'sine'); };
  const move = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.buttons === 0) return;
    if (last.current !== null) {
      dist.current += Math.abs(e.clientX - last.current);
      if (dist.current > 36) { dist.current = 0; add(); }
    }
    last.current = e.clientX;
  };
  if (scrubs >= SCRUBS_NEEDED) return <Done title="Bubble bath" text={`${pet.name} is squeaky clean! ✨`} onBack={onBack} onAgain={() => { setScrubs(0); setRound(round + 1); }} />;
  const dirt = 1 - scrubs / SCRUBS_NEEDED;
  return (
    <main className="screen">
      <ScreenBar title="Bubble bath" onBack={onBack} />
      <p className="hint">Wiggle your finger over {pet.name} to scrub!</p>
      <div className="grow" />
      <div className="park-stage" key={round} onPointerMove={move} onPointerUp={() => { last.current = null; }} onPointerLeave={() => { last.current = null; }} onClick={add} role="button" aria-label="Scrub">
        <span className="park-pet" style={{ filter: `sepia(${dirt}) saturate(${1 + dirt})` }}>{pet.icon}</span>
        <span className="park-bubbles" aria-hidden>{'🫧'.repeat(Math.min(8, Math.ceil(scrubs / 3)))}</span>
      </div>
      <p className="note">{'🧼'.repeat(Math.ceil((scrubs / SCRUBS_NEEDED) * 5))}</p>
      <div className="grow" />
    </main>
  );
}

/** Try silly hats on your Nexling: one hat at a time, a new hat swaps the old one. */
function Hats({ pet, onBack }: { pet: ParkPet; onBack: () => void }) {
  const [hat, setHat] = useState<string | null>(null);
  const wear = (h: string) => { setHat(h); beep(400 + SILLY_HATS.indexOf(h) * 60, 90, 'triangle'); };
  return (
    <main className="screen">
      <ScreenBar title="Silly hats" onBack={onBack} />
      <p className="hint">{hat ? 'Looking silly!' : 'A bit plain... pick a hat!'}</p>
      <div className="grow" />
      <div className="park-stage">
        <span className="park-hats" aria-hidden>{hat && <span>{hat}</span>}</span>
        <span className="park-pet">{pet.icon}</span>
      </div>
      <div className="chips park-hat-row">
        {SILLY_HATS.map((h) => <button key={h} className={`chip${hat === h ? ' chosen' : ''}`} onClick={() => wear(h)} aria-label={`Hat ${h}`}>{h}</button>)}
      </div>
      <button className="btn ghost" onClick={() => setHat(null)}>Take it off</button>
      <div className="grow" />
    </main>
  );
}

const DANCE_BEATS = 12;
/** Tap "Dance!" on the beat. */
function Dance({ pet, onBack }: { pet: ParkPet; onBack: () => void }) {
  const [round, setRound] = useState(0);
  const [beat, setBeat] = useState(-4);
  const t0 = useRef(0);
  const marks = useRef<('perfect' | 'good' | 'miss')[]>([]);
  const [last, setLast] = useState('');
  // Phones only allow sound after a tap, so the party starts from a button.
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!started) return;
    t0.current = performance.now() + 4 * BEAT_MS;
    marks.current = []; setLast(''); setBeat(-4);
    let lastBeat = -5;
    const id = setInterval(() => {
      const b = Math.floor((performance.now() - t0.current) / BEAT_MS);
      setBeat(b);
      if (b !== lastBeat) { lastBeat = b; beep(b < 0 ? 330 : b % 4 === 0 ? 260 : 190, 90, 'triangle', 0.25); }
    }, 50);
    return () => clearInterval(id);
  }, [round, started]);
  if (!started) {
    return (
      <main className="screen center">
        <ScreenBar title="Dance party" onBack={onBack} />
        <div className="grow" /><div className="park-stage"><span className="park-pet">{pet.icon}</span></div>
        <p className="hint">Turn your sound on, then start the music!</p><div className="grow" />
        <button className="btn primary big-tap" onClick={() => { beep(440, 80, 'triangle', 0.25); setStarted(true); }}>🎵 Start the music</button>
      </main>
    );
  }
  if (beat >= DANCE_BEATS) {
    const perfect = marks.current.filter((m) => m === 'perfect').length;
    const good = marks.current.filter((m) => m === 'good').length;
    return <Done title="Dance party" text={perfect + good >= 8 ? `${pet.name} is a dance star! 🌟 (${perfect} perfect)` : `${pet.name} danced ${perfect + good} moves. Try again!`} onBack={onBack} onAgain={() => setRound(round + 1)} />;
  }
  const tap = () => {
    const now = performance.now();
    if (now < t0.current - 300) return;
    const j = danceJudge(beatOffset(now - t0.current));
    marks.current.push(j);
    setLast(j === 'perfect' ? '🌟 Perfect!' : j === 'good' ? '👍 Nice!' : '😅 Oops');
  };
  return (
    <main className="screen">
      <ScreenBar title="Dance party" onBack={onBack} />
      <p className="hint">{beat < 0 ? 'Get ready... tap on the beat!' : last || 'Tap on the beat!'}</p>
      <div className="grow" />
      <div className="park-stage"><span className={`park-pet${beat >= 0 && beat % 2 === 0 ? ' hop' : ''}`}>{pet.icon}</span></div>
      <p className="note" aria-hidden>{Array.from({ length: DANCE_BEATS }, (_, i) => (i < Math.max(0, beat) ? '🎵' : '·')).join(' ')}</p>
      <div className="grow" />
      <button className="btn primary big-tap" onPointerDown={tap}>💃 Dance!</button>
    </main>
  );
}

const THROWS = 5;
/** Tap when the ball swings through the glowing middle and your Nexling catches it. */
function Fetch({ pet, onBack }: { pet: ParkPet; onBack: () => void }) {
  const [round, setRound] = useState(0);
  const [pos, setPos] = useState(0);
  const [tries, setTries] = useState(0);
  const [catches, setCatches] = useState(0);
  const [msg, setMsg] = useState('');
  const t0 = useRef(performance.now());
  useEffect(() => {
    t0.current = performance.now();
    let raf = 0;
    const loop = () => { setPos(ballPos(performance.now() - t0.current)); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [round]);
  if (tries >= THROWS) return <Done title="Fetch" text={`${pet.name} caught ${catches} of ${THROWS}! ${catches >= 4 ? '🏅' : ''}`} onBack={onBack} onAgain={() => { setTries(0); setCatches(0); setMsg(''); setRound(round + 1); }} />;
  const throwIt = () => {
    const hit = fetchHit(ballPos(performance.now() - t0.current));
    setTries((t) => t + 1);
    if (hit) { setCatches((c) => c + 1); beep(700, 120, 'triangle'); setMsg('🎾 Caught it!'); } else { beep(200, 120, 'triangle'); setMsg('💨 Missed!'); }
  };
  return (
    <main className="screen">
      <ScreenBar title={`Fetch ${Math.min(tries + 1, THROWS)}/${THROWS}`} onBack={onBack} />
      <p className="hint">{msg || `Tap when the ball is in the glow!`}</p>
      <div className="grow" />
      <div className="fetch-lane" aria-hidden>
        <i className="fetch-zone" style={{ left: `${FETCH_ZONE[0] * 100}%`, width: `${(FETCH_ZONE[1] - FETCH_ZONE[0]) * 100}%` }} />
        <span className="fetch-ball" style={{ left: `calc(${pos * 100}% - 0.8rem)` }}>🎾</span>
      </div>
      <div className="park-stage"><span className="park-pet">{pet.icon}</span></div>
      <div className="grow" />
      <button className="btn primary big-tap" onPointerDown={throwIt}>🎾 Catch!</button>
    </main>
  );
}
