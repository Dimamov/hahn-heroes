import { useEffect, useRef, useState } from 'react';
import { GameFrame } from './GameFrame.tsx';
import { PagedList } from '../components/PagedList.tsx';
import { burst, centerOf, flashEdge, popup } from '../lib/fx.ts';
import { FALL_SECONDS, judgeTap, stars, sweepMisses, type Note } from '../lib/rhythm.ts';
import type { Level, ParsedSong, SongDef } from '../lib/songs.ts';

type Songs = typeof import('../lib/songs.ts');
type Synth = typeof import('../lib/synth.ts');
const LEAD = 2;

const LANES = ['#ff3fa4', '#22d3ee', '#fbbf24'];

type Result = { stars: number; perfect: number; good: number; miss: number };

/** Tap the falling notes in time with real tunes. No timer pressure, no lives: just fun. */
export function RhythmTap() {
  const [libs, setLibs] = useState<{ songs: Songs; synth: Synth } | null>(null);
  const [level, setLevel] = useState<Level>('easy');
  const [song, setSong] = useState<ParsedSong | null>(null);
  const [done, setDone] = useState<Result | null>(null);
  // The songs and the sound maker load only when this game opens, so the rest of the app stays small.
  useEffect(() => { Promise.all([import('../lib/songs.ts'), import('../lib/synth.ts')]).then(([songs, synth]) => setLibs({ songs, synth })); }, []);

  if (!libs) return <GameFrame title="Rhythm Tap"><div className="spinner" /></GameFrame>;
  if (done && song) {
    return (
      <GameFrame title="Rhythm Tap">
        <div className="grow" />
        <div className="soon-icon" aria-hidden>{'⭐'.repeat(done.stars)}</div>
        <h3>{song.def.name}: {done.stars === 3 ? 'Perfect rhythm!' : done.stars === 2 ? 'Great beat!' : 'Nice try!'}</h3>
        <p className="hint">{done.perfect} perfect · {done.good} good · {done.miss} missed</p>
        <div className="grow" />
        <div className="btn-grid">
          <button className="btn ghost" onClick={() => { libs.synth.unlockAudio(); setDone(null); }}>Play again</button>
          <button className="btn primary" onClick={() => { setDone(null); setSong(null); }}>Pick a song</button>
        </div>
      </GameFrame>
    );
  }
  if (!song) {
    const pick = (def: SongDef) => { libs.synth.unlockAudio(); setSong(libs.songs.parseSong(def)); };
    return (
      <GameFrame title="Rhythm Tap" hint="Pick a level and a song. Tap each lane when a note reaches the line.">
        <div className="chips" role="group" aria-label="Level">
          {libs.songs.LEVELS.map((l) => <button key={l.id} className={`chip${level === l.id ? ' chosen' : ''}`} onClick={() => setLevel(l.id)}>{l.label}</button>)}
        </div>
        <div className="rt-songs"><PagedList items={libs.songs.LIBRARY} perPage={4} empty="No songs yet." render={(def) => (
          <button className="btn primary song-btn" key={def.id} onClick={() => pick(def)}>
            <span>{def.icon} {def.name}</span><small>{def.by}</small>
          </button>
        )} /></div>
        <p className="hint credits">Old tunes are public domain. The hero tracks were made for HAHN Heroes.</p>
      </GameFrame>
    );
  }
  return <Play song={song} level={level} libs={libs} onDone={setDone} onExit={() => setSong(null)} />;
}

function Play({ song, level, libs, onDone, onExit }: { song: ParsedSong; level: Level; libs: { songs: Songs; synth: Synth }; onDone: (r: Result) => void; onExit: () => void }) {
  const notes = useRef<Note[]>(libs.songs.beatMap(song, level, LEAD));
  const start = useRef(performance.now());
  const [, frame] = useState(0);
  const [combo, setCombo] = useState(0);
  const [said, setSaid] = useState('Get ready...');
  const finished = useRef(false);
  const now = () => (performance.now() - start.current) / 1000;

  useEffect(() => {
    start.current = performance.now();
    const stop = libs.synth.playSong(song, LEAD);
    let raf = 0;
    const loop = () => {
      const t = now();
      if (sweepMisses(notes.current, t) > 0) { setCombo(0); setSaid('Missed'); flashEdge('#ff5c7a66'); }
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
    return () => { cancelAnimationFrame(raf); stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = (lane: number) => {
    const r = judgeTap(notes.current, lane, now());
    libs.synth.tapClick(lane);
    const pad = document.querySelectorAll('.rt-pad')[lane];
    const c = centerOf(document.querySelectorAll('.rt-lane')[lane] ?? pad); const line = document.querySelector('.rt-line')?.getBoundingClientRect();
    if (r) {
      setCombo((n) => n + 1); setSaid(r === 'perfect' ? 'Perfect!' : 'Good');
      const y = line ? line.top : c.y;
      burst(c.x, y, LANES[lane], r === 'perfect' ? 14 : 8, 60); popup(c.x, y - 10, r === 'perfect' ? 'PERFECT!' : 'Good', r === 'perfect' ? '#fbbf24' : '#fff');
      if ((combo + 1) % 10 === 0) popup(innerWidth / 2, innerHeight / 3, `${combo + 1} COMBO!`, '#ff3fa4', true);
    } else setSaid('Wait for the note');
  };

  const t = now();
  return (
    <GameFrame title={song.def.name} onExit={onExit} right={<b className="rt-combo" aria-live="polite">{combo > 1 ? `${combo} combo` : ''}</b>}>
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
