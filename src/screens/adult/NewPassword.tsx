import { useState } from 'react';
import { AdultAuthError, type Backend } from '../../lib/backend.ts';

/** Shown when a grown-up opens the password-reset link from their email. */
export function NewPassword({ backend, onDone }: { backend: Backend; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError('');
    try { await backend.adultSetPassword(password); onDone(); }
    catch (e) { setError(e instanceof AdultAuthError && e.kind === 'weak' ? 'Please use a longer password (at least 8 letters or numbers).' : 'That link may have expired. Ask for a new one.'); }
    finally { setBusy(false); }
  };
  return (
    <form className="screen" onSubmit={(e) => { e.preventDefault(); if (password.length >= 8 && !busy) submit(); }}>
      <header className="bar"><h2>Choose a new password</h2></header>
      <div className="grow" />
      <label className="field plain"><span>New password</span>
        <input type="password" name="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <p className="error" role="alert">{error}</p>
      <div className="grow" />
      <button className="btn primary" type="submit" disabled={password.length < 8 || busy}>{busy ? 'One moment…' : 'Save new password'}</button>
    </form>
  );
}
