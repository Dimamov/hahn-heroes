import { useEffect, useState } from 'react';
import { GameFrame, WinPanel } from './GameFrame.tsx';
import { beep } from '../lib/sound.ts';
import { COLS, KINDS, LIVES, PATH, ROWS, WAVES, foePos, isGrass, newState, placeHero, startWave, step, type Kind } from '../lib/tower.ts';

const pct = (v: number, n: number) => `${((v + 0.5) / n) * 100}%`;
const ROAD = new Set(PATH.map(([r, c]) => r * COLS + c));

/** Place heroes on the grass to stop waves of shadows walking the road. Survive all the waves to win. */
export function HeroDefense() {
  const [s, setS] = useState(newState);
  const [kind, setKind] = useState<Kind>('spark');
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (s.phase !== 'wave') return;
    const id = window.setInterval(() => setS((x) => step(x, 0.1)), 100);
    return () => window.clearInterval(id);
  }, [s.phase]);

  const again = () => { setS(newState()); setRound((r) => r + 1); };
  const tap = (r: number, c: number) => {
    if (!isGrass(r, c)) return;
    const n = placeHero(s, r, c, kind);
    if (n === s) { beep(200, 80, 'sawtooth'); return; }
    beep(560, 90, 'triangle'); setS(n);
  };

  if (s.phase === 'won') return <GameFrame title="Hero Defense"><WinPanel game="hero-defense" message="The shadows are beaten!" onAgain={again} /></GameFrame>;
  if (s.phase === 'lost') {
    return (
      <GameFrame title="Hero Defense">
        <div className="grow" />
        <div className="soon-icon" aria-hidden>🌑</div>
        <h3>The shadows got through</h3>
        <p className="hint">You held out for {Math.max(0, s.wave - 1)} of {WAVES} waves. Try different heroes!</p>
        <div className="grow" />
        <button className="btn primary" onClick={again}>Try again</button>
      </GameFrame>
    );
  }
  return (
    <GameFrame title="Hero Defense" key={round}>
      <p className="note">❤️ {s.lives}/{LIVES} · ⚡ {s.energy} · Wave {Math.max(1, s.wave)}/{WAVES}</p>
      <div className="td-board">
        {Array.from({ length: ROWS * COLS }, (_, k) => {
          const r = Math.floor(k / COLS), c = k % COLS;
          const hero = s.heroes.find((h) => h.r === r && h.c === c);
          return (
            <button key={k} className={`td-cell${ROAD.has(k) ? ' road' : ''}`} onClick={() => tap(r, c)} aria-label={ROAD.has(k) ? 'Road' : hero ? KINDS[hero.kind].name : `Grass row ${r + 1} column ${c + 1}`}>
              {hero && <span aria-hidden>{KINDS[hero.kind].icon}</span>}
            </button>
          );
        })}
        {s.foes.map((f, i) => {
          const [r, c] = foePos(f.p);
          return <i key={i} className="td-foe" style={{ left: pct(c, COLS), top: pct(r, ROWS) }} aria-hidden>👻<b style={{ width: `${Math.max(0, (f.hp / f.max) * 100)}%` }} /></i>;
        })}
      </div>
      <div className="td-bar">
        {(Object.keys(KINDS) as Kind[]).map((k) => (
          <button key={k} className={`chip${kind === k ? ' chosen' : ''}`} disabled={s.energy < KINDS[k].cost && kind !== k} onClick={() => setKind(k)}>{KINDS[k].icon} {KINDS[k].name} {KINDS[k].cost}</button>
        ))}
      </div>
      {s.phase === 'build'
        ? <button className="btn primary" onClick={() => setS(startWave(s))}>{s.wave === 0 ? 'Start wave 1' : `Start wave ${s.wave + 1}`}</button>
        : <p className="note">The shadows are coming…</p>}
    </GameFrame>
  );
}
