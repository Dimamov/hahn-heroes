import { useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { GOOFY, GOOFY_REWARD, type GoofyState } from '../lib/goofy.ts';

/** A mystery silly challenge once a day. You see it only after you accept, and cannot swap it. Honor system, no photos. */
export function Goofy() {
  const { backend, go, refresh } = useSession();
  const [s, setS] = useState<GoofyState | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { backend.goofyState().then(setS).catch(() => setS({ status: null, prompt: null, doneToday: 0 })); }, [backend]);
  const accept = () => backend.goofyAccept().then(setS).catch(() => setMsg("That didn't work. Try again."));
  const finish = async (done: boolean) => {
    try {
      const r = await backend.goofyFinish(done);
      setS(await backend.goofyState());
      setMsg(done ? (r.awarded ? `+${r.awarded} 💎 The Nexus approves!` : 'The Nexus approves!') : 'No problem. Safety first!');
      await refresh();
    } catch { setMsg("That didn't work. Try again."); }
  };
  const g = s && s.prompt !== null ? GOOFY[s.prompt % GOOFY.length] : null;
  return (
    <main className="screen">
      <ScreenBar title="Goofy Challenge" onBack={() => go('home')} />
      {!s ? <div className="spinner" /> : (
        <>
          {s.status === null && (
            <>
              <div className="grow" />
              <div className="soon-icon" aria-hidden>❓</div>
              <h3>Dare to accept?</h3>
              <p className="hint">You will not see the challenge until you accept it, and you cannot swap it for another one.</p>
              <div className="grow" />
              <button className="btn primary" onClick={accept}>⚡ Accept the mystery challenge</button>
            </>
          )}
          {s.status === 'accepted' && g && (
            <>
              <div className="grow" />
              <div className="panel"><h3>{g.title}</h3><p>{g.text}</p><small>🔒 Locked in for today. Keep it safe and silly: no running, nothing risky.</small></div>
              <div className="grow" />
              <button className="btn primary" onClick={() => finish(true)}>✓ I did it! (+{GOOFY_REWARD} 💎)</button>
              <button className="btn ghost" onClick={() => finish(false)}>I can't do this safely</button>
            </>
          )}
          {(s.status === 'done' || s.status === 'skipped') && (
            <>
              <div className="grow" />
              <div className="soon-icon" aria-hidden>{s.status === 'done' ? '🎉' : '🙂'}</div>
              <h3>{s.status === 'done' ? 'Mission complete!' : 'See you tomorrow!'}</h3>
              {g && <p className="hint">{g.title}</p>}
              <div className="grow" />
            </>
          )}
          <p className="hint" role="status">{msg}</p>
          {s.doneToday >= 3 && <p className="note">🤪 {s.doneToday} heroes did the goofy challenge today.</p>}
        </>
      )}
    </main>
  );
}
