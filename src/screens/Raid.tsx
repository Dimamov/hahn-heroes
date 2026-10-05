import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import type { RaidState } from '../lib/backend.ts';

/** The school boss raid: everyone strikes once a day, and what you learn today makes the strike stronger. */
export function Raid() {
  const { backend, go, refresh } = useSession();
  const [r, setR] = useState<RaidState | null>(null);
  const [note, setNote] = useState('');
  const [hit, setHit] = useState(false);
  const load = useCallback(() => { backend.raidState().then(setR).catch(() => setNote("Couldn't reach the boss.")); }, [backend]);
  useEffect(load, [load]);

  const strike = async () => {
    try {
      const s = await backend.raidStrike();
      if (s.ok) { setHit(true); setNote(`💥 You hit for ${s.damage}!${s.defeated ? ' The boss is down!' : ''}`); setTimeout(() => setHit(false), 700); }
      else setNote(s.reason === 'defeated' ? 'The boss is already down!' : 'You already struck today. Come back tomorrow!');
      load();
    } catch { setNote("That didn't work. Please try again."); }
  };
  const claim = async () => {
    try { const c = await backend.raidClaim(); setNote(`🎉 +${c.awarded} 💎 for beating the boss!`); load(); refresh().catch(() => undefined); }
    catch { setNote("That isn't ready yet."); }
  };

  if (!r) return <main className="screen"><ScreenBar title="Boss Raid" onBack={() => go('home')} /><div className="spinner" /></main>;
  const pct = Math.round((100 * r.damage) / r.maxHp);
  return (
    <main className="screen raid">
      <ScreenBar title="Boss Raid" onBack={() => go('home')} />
      <div className="raid-boss">
        <span className={`raid-icon${hit ? ' hit' : ''}${r.defeated ? ' down' : ''}`} aria-hidden>{r.boss.icon}</span>
        <b>{r.boss.name}</b>
        <small>{r.boss.blurb}</small>
      </div>
      <div className="raid-bar" role="progressbar" aria-valuenow={r.maxHp - r.damage} aria-valuemin={0} aria-valuemax={r.maxHp} aria-label="Boss health">
        <i style={{ width: `${100 - pct}%` }} />
        <span>{r.defeated ? 'Defeated!' : `${r.maxHp - r.damage} / ${r.maxHp} health`}</span>
      </div>
      <p className="hint">{r.strikers} {r.strikers === 1 ? 'hero has' : 'heroes have'} struck this week · you dealt {r.myDamage}</p>
      <div className="grow" />
      {r.canClaim && <button className="btn primary" onClick={claim}>🎁 Collect {r.reward.coins} 💎</button>}
      {!r.canClaim && !r.defeated && (
        <button className="btn primary" disabled={r.struckToday} onClick={strike}>
          {r.struckToday ? '✅ You struck today' : `⚔️ Strike! (power ${r.power})`}
        </button>
      )}
      {r.claimed && <p className="hint">You collected your reward. Great teamwork!</p>}
      <p className="note" role="status">{note || 'One strike a day. Answer questions in Learn first to hit harder!'}</p>
    </main>
  );
}
