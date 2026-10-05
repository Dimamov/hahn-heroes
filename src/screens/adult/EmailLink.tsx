import { useState } from 'react';
import type { Adult, Backend, EmailLink } from '../../lib/backend.ts';

/** The page an email link opens. Nothing happens until the person taps Continue, so mail scanners that open links can't use the link up. */
export function EmailLinkScreen({ backend, link, onRecovery, onAdult, onClose }: {
  backend: Backend; link: EmailLink; onRecovery: () => void; onAdult: (a: Adult) => void; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const reset = link.type === 'recovery';
  const go = async () => {
    setBusy(true);
    try {
      const r = await backend.completeEmailLink(link);
      if (r.kind === 'recovery') onRecovery(); else onAdult(r.adult);
    } catch {
      setFailed(true);
    } finally { setBusy(false); }
  };
  return (
    <main className="screen center">
      <div className="grow" />
      <div className="soon-icon" aria-hidden>{failed ? '⏳' : reset ? '🔑' : '✅'}</div>
      {failed ? (
        <>
          <p className="hint">This link was already used or has expired. Go back and ask for a new one.</p>
          <div className="grow" />
          <button className="btn primary" onClick={onClose}>Back to the app</button>
        </>
      ) : (
        <>
          <p className="hint">{reset ? 'Tap Continue to choose a new password.' : 'Tap Continue to confirm your email.'}</p>
          <div className="grow" />
          <button className="btn primary" disabled={busy} onClick={go}>{busy ? 'One moment…' : 'Continue'}</button>
        </>
      )}
    </main>
  );
}
