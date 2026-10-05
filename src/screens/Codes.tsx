import { useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';

const REASONS = { not_found: "That code didn't work. Check the spelling.", already_used: 'You already used that code.', too_many_tries: 'Too many tries. Wait a while and try again.' } as const;

/** Type a secret code word from your teacher or the Sensei to win a prize. */
export function Codes() {
  const { backend, go, refresh } = useSession();
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [won, setWon] = useState<{ coins: number; xp: number } | null>(null);
  const redeem = async () => {
    try {
      const r = await backend.codeRedeem(code);
      if (r.ok) { setWon(r); setCode(''); setNote(''); refresh().catch(() => undefined); } else setNote(REASONS[r.reason]);
    } catch { setNote("That didn't work. Try again."); }
  };
  return (
    <main className="screen">
      <ScreenBar title="Secret Code" onBack={() => go('home')} />
      <div className="grow" />
      {won ? (
        <div className="center-text"><div className="soon-icon" aria-hidden>🎉</div><h3>You won a prize!</h3><p className="hint">{[won.coins ? `${won.coins} 💎` : '', won.xp ? `${won.xp} ⭐` : ''].filter(Boolean).join(' and ')}</p><button className="btn ghost" onClick={() => setWon(null)}>Enter another code</button></div>
      ) : (
        <>
          <h3 className="center-text">Got a secret code?</h3>
          <p className="hint">Your teacher or the Sensei may give you a code word, like BRAVE-FOX-42.</p>
          <label className="field">
            <input autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="CODE WORD" maxLength={24} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </label>
          <p className="error" role="alert">{note}</p>
        </>
      )}
      <div className="grow" />
      {!won && <button className="btn primary" disabled={code.trim().length < 5} onClick={redeem}>Use code</button>}
    </main>
  );
}
