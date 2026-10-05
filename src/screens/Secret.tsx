import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import type { SecretState } from '../lib/backend.ts';

/** The weekly secret hunt: a hint, who is winning, and the card prize for the first squad to find the sparkle. */
export function Secret() {
  const { backend, go } = useSession();
  const [s, setS] = useState<SecretState | null>(null);
  const [note, setNote] = useState('');
  const load = useCallback(() => { backend.secretState().then(setS).catch(() => setNote("Couldn't load the hunt.")); }, [backend]);
  useEffect(load, [load]);
  const claim = async () => {
    try { const r = await backend.secretClaim(); setNote(r.ok ? '🎉 The card is in your collection!' : "That isn't ready yet."); load(); } catch { setNote("That isn't ready yet."); }
  };
  return (
    <main className="screen">
      <ScreenBar title="Secret Hunt" onBack={() => go('home')} />
      {!s ? <div className="spinner" /> : (
        <>
          <div className="raid-boss">
            <span className="raid-icon" aria-hidden>✨</span>
            <b>A sparkle is hidden this week</b>
            <small>{s.hint}</small>
          </div>
          <div className="card fun-card">
            <small className="muted">Prize for the first squad to find it</small>
            <p>{s.card.icon} {s.card.name}</p>
          </div>
          <p className="hint">{s.found ? '✅ You found it!' : 'Tap around the Nexus. The sparkle is small.'} {s.finders} {s.finders === 1 ? 'hero has' : 'heroes have'} found it.</p>
          <p className="hint">{s.won ? `🏆 Squad ${s.winnerSquad} found it first!` : 'No squad has found it yet. Join a squad to compete.'}</p>
          <div className="grow" />
          {s.mySquadWon && !s.claimed && <button className="btn primary" onClick={claim}>🎁 Collect your squad's card</button>}
          {s.mySquadWon && s.claimed && <p className="hint">Your squad's card is collected.</p>}
          <p className="note" role="status">{note}</p>
        </>
      )}
    </main>
  );
}

/** The hidden sparkle: a small button on the secret screen that starts the find. */
export function SecretSpot({ week, onFound }: { week: number; onFound: () => void }) {
  const { backend, refresh } = useSession();
  const [msg, setMsg] = useState('');
  const tap = async () => {
    try {
      const r = await backend.secretFind();
      setMsg(r.firstSquad ? '✨ You found it first for your squad! Collect the card in Secret Hunt.' : r.ok ? '✨ You found the secret! +5 💎' : '');
      refresh().catch(() => undefined);
      setTimeout(() => { setMsg(''); onFound(); }, 3500);
    } catch { /* try again next time */ }
  };
  // Tucked in a different corner each week.
  const spot = [{ right: 14, bottom: 90 }, { left: 14, bottom: 90 }, { right: 14, top: 120 }, { left: 14, top: 120 }][week % 4];
  return (
    <>
      <button className="secret-spot" style={spot} onClick={tap} aria-label="A tiny sparkle">✨</button>
      {msg && <div className="pop" role="status">{msg}</div>}
    </>
  );
}
