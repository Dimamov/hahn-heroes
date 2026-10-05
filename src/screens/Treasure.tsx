import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { HUNTS, TREASURE_COIN, type TreasureState } from '../lib/treasure.ts';
import { cardById } from '../lib/cards.ts';

/** The weekly treasure map: read the clue, find the pin on that screen, and win a card at the end. */
export function Treasure() {
  const { backend, go, refresh } = useSession();
  const [s, setS] = useState<TreasureState | null>(null);
  const [note, setNote] = useState('');
  const load = useCallback(() => { backend.treasureState().then(setS).catch(() => setNote("Couldn't load the map.")); }, [backend]);
  useEffect(load, [load]);
  const claim = async () => {
    try { const r = await backend.treasureClaim(); setNote(r.ok ? '🎉 The card is in your collection!' : "That isn't ready yet."); refresh().catch(() => undefined); load(); } catch { setNote("That isn't ready yet."); }
  };
  const hunt = s ? HUNTS[s.hunt] : null;
  const card = s ? cardById(s.card) : null;
  return (
    <main className="screen">
      <ScreenBar title="Treasure Map" onBack={() => go('home')} />
      {!s || !hunt ? <div className="spinner" /> : (
        <>
          <div className="raid-boss">
            <span className="raid-icon" aria-hidden>🗺️</span>
            <b>{hunt.title}</b>
            <small>{s.done ? 'You found every pin!' : `Clue ${s.step + 1} of ${s.steps}`}</small>
          </div>
          <div className="treasure-pins" aria-label={`${s.step} of ${s.steps} pins found`}>{hunt.steps.map((_, i) => <span key={i} className={i < s.step ? 'found' : ''}>{i < s.step ? '📍' : '❔'}</span>)}</div>
          {!s.done && <div className="card fun-card"><small className="muted">Your clue</small><p>{hunt.steps[s.step].clue}</p><small className="muted">Find the little 🗺️ pin on that screen. +{TREASURE_COIN} 💎 each.</small></div>}
          <p className="hint">Prize for the whole map: {card ? `${card.icon} ${card.name}` : 'a card'}</p>
          <div className="grow" />
          {s.done && !s.claimed && <button className="btn primary" onClick={claim}>🎁 Collect your card</button>}
          {s.done && s.claimed && <p className="hint">Your card is collected. A new map comes next week.</p>}
          <p className="note" role="status">{note}</p>
        </>
      )}
    </main>
  );
}

/** The hidden map pin for the current clue. It sits on one screen, in a different corner for each clue. */
export function TreasureSpot({ step, place, onFound }: { step: number; place: string; onFound: () => void }) {
  const { backend, refresh } = useSession();
  const [msg, setMsg] = useState('');
  const tap = async () => {
    try {
      const r = await backend.treasureFind(place);
      if (!r.ok) return;
      setMsg(r.done ? '🗺️ Last pin found! Collect your card in Treasure Map.' : `🗺️ Pin found! +${TREASURE_COIN} 💎 Next clue is waiting in Treasure Map.`);
      refresh().catch(() => undefined);
      setTimeout(() => { setMsg(''); onFound(); }, 3500);
    } catch { /* try again next time */ }
  };
  const spot = [{ right: 14, bottom: 150 }, { left: 14, bottom: 150 }, { right: 14, top: 150 }, { left: 14, top: 150 }][step % 4];
  return (
    <>
      {!msg && <button className="secret-spot" style={spot} onClick={tap} aria-label="A tiny map pin">🗺️</button>}
      {msg && <div className="pop" role="status">{msg}</div>}
    </>
  );
}
