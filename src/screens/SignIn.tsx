import { useState } from 'react';
import { SignInError, type Backend, type Hero } from '../lib/backend.ts';
import { formatHeroCode, HERO_CODE_LENGTH, LEGACY_PICTURE_LENGTH, normalizeHeroCode } from '../../supabase/functions/_shared/kid-auth.ts';
import { PicturePad } from '../components/PicturePad.tsx';

function message(e: unknown): string {
  if (e instanceof SignInError) {
    if (e.kind === 'resting') return `That hero is resting. Try again in ${Math.max(1, Math.ceil((e.detail?.retryAfter ?? 60) / 60))} minutes, or ask a grown-up.`;
    if (e.kind === 'wrong') {
      const left = e.detail?.triesLeft;
      return `Hmm, that code or those pictures don't match.${left !== undefined ? ` ${left} ${left === 1 ? 'try' : 'tries'} left.` : ''}`;
    }
  }
  return "Can't reach the Nexus right now. Check your connection and try again.";
}

export function SignIn({ backend, onDone, onBack }: { backend: Backend; onDone: (h: Hero) => void; onBack: () => void }) {
  const fromQr = new URLSearchParams(window.location.search).get('code') ?? '';
  const [code, setCode] = useState(normalizeHeroCode(fromQr).slice(0, HERO_CODE_LENGTH));
  const [picture, setPicture] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = code.length === HERO_CODE_LENGTH && picture.length >= LEGACY_PICTURE_LENGTH && !busy;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      onDone(await backend.signIn(code, picture));
    } catch (e) {
      setError(message(e));
      setPicture([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="screen">
      <header className="bar"><button className="back" onClick={onBack} aria-label="Back">←</button><h2>Welcome back</h2></header>
      <label className="field">
        <span>Your hero code</span>
        <input
          inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false}
          placeholder="ABCD-EFGH" value={formatHeroCode(code.padEnd(0))}
          onChange={(e) => setCode(normalizeHeroCode(e.target.value).slice(0, HERO_CODE_LENGTH))}
        />
      </label>
      <p className="hint">Tap your secret pictures in order (4, or 3 if you made them earlier).</p>
      <PicturePad value={picture} onChange={setPicture} />
      <p className="error" role="alert">{error}</p>
      <div className="grow" />
      <button className="btn primary" disabled={!ready} onClick={submit}>{busy ? 'Opening the Nexus…' : 'Enter the Nexus'}</button>
    </main>
  );
}
