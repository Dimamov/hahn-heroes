import { useState } from 'react';
import { AdultAuthError, type Adult, type Backend } from '../../lib/backend.ts';
import { ScreenBar } from '../../components/ScreenBar.tsx';

const MESSAGES: Record<AdultAuthError['kind'], string> = {
  wrong: "That email and password don't match.",
  taken: 'There is already an account with that email. Try signing in.',
  weak: 'Please use a longer password (at least 8 letters or numbers).',
  network: "Can't reach the Nexus right now. Check your connection, or confirm your email first.",
};

export function AdultAuth({ backend, onDone, onBack }: { backend: Backend; onDone: (a: Adult) => void; onBack: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(new URLSearchParams(window.location.search).has('link') ? 'signup' : 'signin');
  const [role, setRole] = useState<'parent' | 'teacher'>('parent');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const ready = email.includes('@') && (mode === 'forgot' || password.length >= 6) && (mode !== 'signup' || name.trim().length >= 2) && !busy;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (mode === 'forgot') { await backend.adultRequestReset(email); setSent(true); }
      else if (mode === 'signin') onDone(await backend.adultSignIn(email, password));
      else {
        const r = await backend.adultSignUp(email, password, role, name);
        if (r === 'confirm_email') setConfirm(true); else onDone(r);
      }
    } catch (e) {
      setError(e instanceof AdultAuthError ? MESSAGES[e.kind] : 'Something went wrong. Please try again.');
    } finally { setBusy(false); }
  };

  if (sent) {
    return (
      <main className="screen center">
        <ScreenBar title="Check your email" onBack={onBack} />
        <div className="grow" />
        <div className="soon-icon" aria-hidden>📬</div>
        <p className="hint">If there is an account for {email}, we sent a link to choose a new password. Tap it on this device.</p>
        <div className="grow" />
        <button className="btn primary" onClick={() => { setSent(false); setMode('signin'); setPassword(''); }}>Back to sign in</button>
      </main>
    );
  }

  if (confirm) {
    return (
      <main className="screen center">
        <ScreenBar title="Check your email" onBack={onBack} />
        <div className="grow" />
        <div className="soon-icon" aria-hidden>📬</div>
        <p className="hint">We sent a link to {email}. Tap it, then come back and sign in.</p>
        <div className="grow" />
        <button className="btn primary" onClick={() => { setConfirm(false); setMode('signin'); }}>I confirmed, sign in</button>
      </main>
    );
  }

  return (
    <form className="screen" onSubmit={(e) => { e.preventDefault(); if (ready) submit(); }}>
      <ScreenBar title={mode === 'signin' ? 'Grown-up sign in' : mode === 'forgot' ? 'Forgot password' : 'Make a grown-up account'} onBack={onBack} />
      {mode === 'signup' && (
        <>
          <div className="seg" role="radiogroup" aria-label="I am a">
            {(['parent', 'teacher'] as const).map((r) => (
              <button key={r} role="radio" aria-checked={role === r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>
                {r === 'parent' ? 'Parent or guardian' : 'Teacher'}
              </button>
            ))}
          </div>
          <label className="field plain"><span>Your name</span>
            <input value={name} maxLength={60} autoComplete="name" onChange={(e) => setName(e.target.value)} placeholder={role === 'teacher' ? 'Ms. Rivera' : 'Alex Smith'} />
          </label>
        </>
      )}
      <label className="field plain"><span>Email</span>
        <input type="email" name="email" inputMode="email" autoCapitalize="none" value={email} autoComplete={mode === 'signup' ? 'email' : 'username'} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {mode === 'forgot' && <p className="hint">Enter your email and we will send you a link to choose a new password.</p>}
      {mode !== 'forgot' && <label className="field plain"><span>Password</span>
        <input type="password" name="password" value={password} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} onChange={(e) => setPassword(e.target.value)} />
      </label>}
      {mode === 'signup' && role === 'teacher' && <p className="note">The Sensei approves teacher accounts before they can make a class.</p>}
      <p className="error" role="alert">{error}</p>
      <div className="grow" />
      <button className="btn primary" type="submit" disabled={!ready}>{busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : mode === 'forgot' ? 'Send reset link' : 'Create account'}</button>
      {mode === 'signin' && <button type="button" className="btn link" onClick={() => { setMode('forgot'); setError(''); }}>Forgot your password?</button>}
      <button type="button" className="btn link" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}>
        {mode === 'signin' ? 'New here? Make an account' : 'I already have an account'}
      </button>
    </form>
  );
}
