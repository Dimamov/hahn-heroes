import { useEffect, useRef, useState } from 'react';
import { GameFrame } from './GameFrame.tsx';
import { beep } from '../lib/sound.ts';
import { FALL_SECONDS, SONGS, judgeTap, notesFor, stars, sweepMisses, type Note, type Song } from '../lib/rhythm.ts';

const LANES = ['#ff3fa4', '#22d3ee', '#fbbf24'];
const TONES = [392, 523, 659];

/** Tap the falling notes in time with the beat. No timer pressure, no lives: just fun. */
export function RhythmTap() {
  const [song, setSong] = useState<Song | null>(null);
  const [done, setDone] = useState<{ stars: number; perfect: number; good: number; miss: number } | null>(null);
  if (done && song) {
    return (
      <GameFrame title="Rhythm Tap">
        <div className="grow" />
        <div className="soon-icon" aria-hidden>{'⭐'.repeat(done.stars)}</div>
        <h3>{song.name}: {done.stars === 3 ? 'Perfect rhythm!' : done.stars === 2 ? 'Great beat!' : 'Nice try!'}</h3>
        <p className="hint">{done.perfect} perfect · {done.good} good · {done.miss} missed</p>
        <div className="grow" />
        <div className="btn-grid">
          <button className="btn ghost" onClick={() => setDone(null)}>Play again</button>
          <button className="btn primary" onClick={() => { setDone(null); setSong(null); }}>Pick a song</button>
        </div>
      </GameFrame>
    );
  }
  if (!song) {
    return (
      <GameFrame title="Rhythm Tap" hint="Pick a song. Tap each lane when a note reaches the line.">
        <div className="grow" />
        {SONGS.map((s) => <button className="btn primary" key={s.id} onClick={() => setSong(s)}>{s.icon} {s.name}</button>)}
        <div className="grow" />
      </GameFrame>
    );
  }
  return <Play song={song} onDone={setDone} onExit={() => setSong(null)} />;
}

function Play({ song, onDone, onExit }: { song: Song; onDone: (r: { stars: number; perfect: number; good: number; miss: number }) => void; onExit: () => void }) {
  const notes = useRef<Note[]>(notesFor(song));
  const start = useRef(performance.now());
  const [, frame] = useState(0);
  const [combo, setCombo] = useState(0);
  const [said, setSaid] = useState('Get ready...');
  const finished = useRef(false);
  const now = () => (performance.now() - start.current) / 1000;

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const t = now();
      if (sweepMisses(notes.current, t) > 0) { setCombo(0); setSaid('Missed'); }
      const last = notes.current[notes.current.length - 1];
      if (!finished.current && last.result !== null) {
        finished.current = true;
        const count = (r: Note['result']) => notes.current.filter((n) => n.result === r).length;
        window.setTimeout(() => onDone({ stars: stars(notes.current), perfect: count('perfect'), good: count('good'), miss: count('miss') }), 500);
      }
      frame((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = (lane: number) => {
    const r = judgeTap(notes.current, lane, now());
    beep(TONES[lane], 120, 'triangle');
    if (r) { setCombo((c) => c + 1); setSaid(r === 'perfect' ? 'Perfect!' : 'Good'); } else setSaid('Wait for the note');
  };

  const t = now();
  return (
    <GameFrame title={song.name} onExit={onExit} right={<b className="rt-combo" aria-live="polite">{combo > 1 ? `${combo} combo` : ''}</b>}>
      <div className="rt-board" aria-label="Falling notes">
        {LANES.map((color, lane) => (
          <div className="rt-lane" key={lane}>
            {notes.current.filter((n) => n.lane === lane && n.result === null).map((n, i) => {
              const y = ((t - (n.time - FALL_SECONDS)) / FALL_SECONDS) * 100;
              return y > -10 && y < 110 ? <i key={i} className="rt-note" style={{ top: `${y}%`, background: color }} /> : null;
            })}
          </div>
        ))}
        <div className="rt-line" />
      </div>
      <p className="hint" role="status">{said}</p>
      <div className="rt-pads">
        {LANES.map((color, lane) => <button key={lane} className="rt-pad" style={{ background: color }} onPointerDown={() => tap(lane)} aria-label={`Lane ${lane + 1}`} />)}
      </div>
    </GameFrame>
  );
}
