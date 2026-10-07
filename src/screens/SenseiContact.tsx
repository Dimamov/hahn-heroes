import { useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import type { SenseiMessage, SenseiMessageKind } from '../lib/backend.ts';

const KINDS: Record<SenseiMessageKind, { icon: string; label: string; title: string; hint: string }> = {
  message: { icon: '💬', label: 'Send a message', title: 'Message the Sensei', hint: 'What would you like to tell the Sensei?' },
  bug: { icon: '🐞', label: 'Report a bug', title: 'Report a bug', hint: 'What went wrong? Tell me where you were and what you tapped.' },
  idea: { icon: '💡', label: 'Suggest an idea', title: 'Suggest an idea', hint: 'What new feature or game should the Nexus have?' },
};

/** "The Sensei": heroes write to the Sensei inside the app. No email address or outside link is ever shown. */
export function SenseiContact() {
  const { backend, go } = useSession();
  const [mode, setMode] = useState<'menu' | SenseiMessageKind | 'mine'>('menu');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState<SenseiMessageKind | null>(null);
  const [mine, setMine] = useState<SenseiMessage[] | null>(null);
  useEffect(() => {
    if (mode === 'mine') backend.senseiMyMessages().then(setMine).catch(() => setMine([]));
  }, [mode, backend]);

  const send = async (kind: SenseiMessageKind) => {
    setError('');
    try { await backend.senseiMessageSend(kind, text.trim()); setSent(kind); setText(''); }
    catch (e) {
      const m = e instanceof Error ? e.message : '';
      setError(m.includes('kind words') ? 'Please use kind words, hero.' : m.includes('too many') ? 'That is a lot of messages today. Try again tomorrow.' : "Couldn't send that. Please try again.");
    }
  };

  if (sent) {
    return (
      <main className="screen center"><div className="grow" /><div className="soon-icon" aria-hidden>🧙</div>
        <h3>Message sent!</h3>
        <p className="hint">{sent === 'message' ? 'The Sensei will read it soon.' : 'Thank you, hero! If it helps the Nexus, you could earn a reward.'}</p>
        <div className="grow" />
        <button className="btn primary" onClick={() => { setSent(null); setMode('menu'); }}>Done</button></main>
    );
  }
  if (mode === 'menu') {
    return (
      <main className="screen">
        <ScreenBar title="The Sensei" onBack={() => go('home')} />
        <div className="grow-col">
          {(Object.keys(KINDS) as SenseiMessageKind[]).map((k) => (
            <button key={k} className="btn big" onClick={() => setMode(k)}>{KINDS[k].icon} {KINDS[k].label}</button>
          ))}
          <button className="btn" onClick={() => setMode('mine')}>📬 My messages</button>
        </div>
      </main>
    );
  }
  if (mode === 'mine') {
    return (
      <main className="screen">
        <ScreenBar title="My messages" onBack={() => setMode('menu')} />
        {mine === null ? <div className="spinner" /> : mine.length === 0 ? <p className="hint">You have not written to the Sensei yet.</p> : (
          <div className="list">
            {mine.map((m) => (
              <div className="card" key={m.id}>
                <div className="card-top"><b>{KINDS[m.kind].icon} {KINDS[m.kind].title}</b><small className="muted">{new Date(m.createdAt).toLocaleDateString()}</small></div>
                <p>{m.body}</p>
                {m.reply && <p className="hint">🧙 {m.reply}</p>}
                {m.reward > 0 && <p><b>💎 You earned {m.reward} diamonds!</b></p>}
              </div>
            ))}
          </div>
        )}
      </main>
    );
  }
  const k = mode;
  return (
    <main className="screen">
      <ScreenBar title={KINDS[k].title} onBack={() => { setMode('menu'); setError(''); }} />
      <label className="field plain grow-field"><span>{KINDS[k].hint}</span>
        <textarea value={text} maxLength={500} onChange={(e) => setText(e.target.value)} /></label>
      <p className="hint">Do not write your real name, school or other private details.</p>
      <p className="error" role="alert">{error}</p>
      <button className="btn primary" disabled={!text.trim()} onClick={() => send(k)}>Send to the Sensei</button>
    </main>
  );
}
