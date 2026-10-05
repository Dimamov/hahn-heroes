import { useEffect, useRef, useState } from 'react';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { beep } from '../lib/sound.ts';
import { RIVALS, hidingSpots, isRaceDay, nextTreat, racePlace, raceProgress, rivalProgress } from '../lib/nexling-games.ts';

type Game = null | 'feed' | 'hide' | 'race';
interface Pet { icon: string; name: string; color: string }

/** Three small games to play with your Nexling. They are just for fun: no points, no pressure. */
export function NexlingPlay({ pet, onBack }: { pet: Pet; onBack: () => void }) {
  const [game, setGame] = useState<Game>(null);
  const raceOpen = isRaceDay(new Date());
  if (game === 'feed') return <Feed pet={pet} onBack={() => setGame(null)} />;
  if (game === 'hide') return <HideSeek pet={pet} onBack={() => setGame(null)} />;
  if (game === 'race') return <Race pet={pet} onBack={() => setGame(null)} />;
  return (
    <main className="screen">
      <ScreenBar title={`Play with ${pet.name}`} onBack={onBack} />
      <p className="hint">Games for you and your Nexling. Just for fun!</p>
      <div className="grow" />
      <button className="btn primary" onClick={() => setGame('feed')}>🍎 Feeding time</button>
      <button className="btn primary" onClick={() => setGame('hide')}>🌿 Hide and seek</button>
      <button className="btn primary" disabled={!raceOpen} onClick={() => setGame('race')}>🏁 Weekend race</button>
      {!raceOpen && <p className="note">Race day is Saturday and Sunday.</p>}
      <div className="grow" />
    </main>
  );
}

function Result({ title, text, onAgain, onBack }: { title: string; text: string; onAgain: () => void; onBack: () => void }) {
  return (
    <main className="screen center">
      <ScreenBar title={title} onBack={onBack} />
      <div className="grow" /><div className="soon-icon" aria-hidden>🎉</div><h3>{text}</h3><div className="grow" />
      <div className="btn-grid"><button className="btn ghost" onClick={onBack}>Done</button><button className="btn primary" onClick={onAgain}>Play again</button></div>
    </main>
  );
}

const FEED_SECONDS = 20;
/** Tap the treats your Nexling loves. Skip the ones it does not. */
function Feed({ pet, onBack }: { pet: Pet; onBack: () => void }) {
  const [treat, setTreat] = useState(nextTreat());
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(FEED_SECONDS);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  useEffect(() => { if (left <= 0) return; const t = setTimeout(() => setTreat(nextTreat()), 1400); return () => clearTimeout(t); }, [treat, left]);
  if (left <= 0) return <Result title="Feeding time" text={`${pet.name} ate ${score} yummy treats!`} onBack={onBack} onAgain={() => { setScore(0); setLeft(FEED_SECONDS); setTreat(nextTreat()); setRound(round + 1); }} />;
  const tap = () => { setScore((s) => Math.max(0, s + (treat.good ? 1 : -1))); beep(treat.good ? 600 : 200, 100, 'triangle'); setTreat(nextTreat()); };
  return (
    <main className="screen">
      <ScreenBar title="Feeding time" onBack={onBack} right={<b>{left}s</b>} />
      <p className="hint">Tap the treats {pet.name} loves. Skip the veggies!</p>
      <div className="grow" />
      <div className="nex-preview" style={{ borderColor: pet.color }}><span style={{ fontSize: '4rem' }}>{pet.icon}</span><b>🍽 {score}</b></div>
      <button className="treat" key={`${round}-${left}-${treat.icon}`} onClick={tap} aria-label={treat.good ? 'A treat' : 'Not a favorite'}>{treat.icon}</button>
      <div className="grow" />
    </main>
  );
}

const SPOTS = ['🌿', '🌳', '🪨', '📦', '🛖', '🌵'];
const HIDE_ROUNDS = 5;
/** Your Nexling hides behind one of six things. Tap to find it. */
function HideSeek({ pet, onBack }: { pet: Pet; onBack: () => void }) {
  const [plan, setPlan] = useState(() => hidingSpots(HIDE_ROUNDS, SPOTS.length));
  const [round, setRound] = useState(0);
  const [tries, setTries] = useState(0);
  const [wrong, setWrong] = useState<number[]>([]);
  const [found, setFound] = useState(false);
  if (round >= HIDE_ROUNDS) return <Result title="Hide and seek" text={tries <= HIDE_ROUNDS + 2 ? `Super seeker! ${tries} tries in ${HIDE_ROUNDS} rounds.` : `You found ${pet.name} every time! (${tries} tries)`} onBack={onBack} onAgain={() => { setPlan(hidingSpots(HIDE_ROUNDS, SPOTS.length)); setRound(0); setTries(0); setWrong([]); setFound(false); }} />;
  const pick = (i: number) => {
    if (found || wrong.includes(i)) return;
    setTries((t) => t + 1);
    if (i === plan[round]) { setFound(true); beep(660, 150, 'triangle'); }
    else { setWrong([...wrong, i]); beep(220, 120, 'triangle'); }
  };
  const next = () => { setRound(round + 1); setFound(false); setWrong([]); };
  return (
    <main className="screen">
      <ScreenBar title={`Hide and seek ${round + 1}/${HIDE_ROUNDS}`} onBack={onBack} />
      <p className="hint">{found ? `Found ${pet.name}! 🎉` : `Where is ${pet.name} hiding?`}</p>
      <div className="hide-grid">
        {SPOTS.map((s, i) => (
          <button key={i} className="hide-spot" disabled={!found && wrong.includes(i)} onClick={() => pick(i)} aria-label={`Hiding spot ${i + 1}`}>
            {found && i === plan[round] ? pet.icon : wrong.includes(i) ? '💨' : s}
          </button>
        ))}
      </div>
      <div className="grow" />
      {found && <button className="btn primary" onClick={next}>{round + 1 === HIDE_ROUNDS ? 'See result' : 'Next round'}</button>}
    </main>
  );
}

/** Tap to dash your Nexling to the finish line before the rivals. */
function Race({ pet, onBack }: { pet: Pet; onBack: () => void }) {
  const [taps, setTaps] = useState(0);
  const [go, setGo] = useState(false);
  const [secs, setSecs] = useState(0);
  const [place, setPlace] = useState<number | null>(null);
  const start = useRef(0);
  useEffect(() => { const t = setTimeout(() => { start.current = performance.now(); setGo(true); }, 1500); return () => clearTimeout(t); }, []);
  useEffect(() => {
    if (!go || place !== null) return;
    const id = setInterval(() => {
      const s = (performance.now() - start.current) / 1000;
      setSecs(s);
      const hero = raceProgress(taps);
      if (hero >= 100 || RIVALS.some((r) => rivalProgress(r.pace, s) >= 100)) setPlace(racePlace(hero, s));
    }, 100);
    return () => clearInterval(id);
  }, [go, place, taps]);
  if (place !== null) return <Result title="Weekend race" text={place === 1 ? `${pet.name} won! 🏆` : `${pet.name} came in ${place === 2 ? '2nd' : place === 3 ? '3rd' : '4th'}. Try again!`} onBack={onBack} onAgain={() => { setTaps(0); setGo(false); setSecs(0); setPlace(null); setTimeout(() => { start.current = performance.now(); setGo(true); }, 1500); }} />;
  const lanes = [{ name: pet.name, icon: pet.icon, pct: raceProgress(taps) }, ...RIVALS.map((r) => ({ name: r.name, icon: r.icon, pct: rivalProgress(r.pace, secs) }))];
  return (
    <main className="screen">
      <ScreenBar title="Weekend race" onBack={onBack} />
      <p className="hint">{go ? 'Tap, tap, tap!' : 'Ready... set...'}</p>
      <div className="race-track">
        {lanes.map((l, i) => (
          <div className="race-lane" key={i}><span style={{ left: `calc(${l.pct}% * .88)` }} title={l.name}>{l.icon}</span></div>
        ))}
      </div>
      <div className="grow" />
      <button className="btn primary big-tap" disabled={!go} onPointerDown={() => { setTaps((t) => t + 1); beep(300 + (taps % 5) * 40, 60, 'triangle'); }}>👟 DASH!</button>
    </main>
  );
}
