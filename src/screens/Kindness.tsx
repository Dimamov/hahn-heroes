import { useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { KIND_REASONS, kindReason, type KindState } from '../lib/kindness.ts';

/** Kindness points: thank a squad mate with a preset reason, once a day. A grown-up approves before points are paid. */
export function Kindness() {
  const { backend, go } = useSession();
  const [s, setS] = useState<KindState | null>(null);
  const [mate, setMate] = useState('');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => backend.kindState().then(setS).catch(() => setS({ nominatedToday: false, mates: [], received: [] }));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async () => {
    try { await backend.kindNominate(mate, reason); setMsg('Sent! A grown-up will take a look. 💛'); setMate(''); setReason(''); load(); }
    catch (e) { setMsg(e instanceof Error && e.message ? e.message : "That didn't work."); }
  };
  return (
    <main className="screen">
      <ScreenBar title="Kindness" onBack={() => go('home')} />
      {!s ? <div className="spinner" /> : s.mates.length === 0 ? <p className="hint">Join a squad to thank your squad mates.</p> : s.nominatedToday ? (
        <p className="hint">You thanked someone today. Come back tomorrow! 💛</p>
      ) : (
        <>
          <p className="hint">Who helped you or someone else today?</p>
          <div className="chips">{s.mates.slice(0, 6).map((m) => <button key={m.id} className={`chip${mate === m.id ? ' chosen' : ''}`} onClick={() => setMate(m.id)}>{m.name}</button>)}</div>
          <div className="chips kind-reasons">{KIND_REASONS.map((r) => <button key={r.id} className={`chip${reason === r.id ? ' chosen' : ''}`} onClick={() => setReason(r.id)}>{r.icon} {r.label}</button>)}</div>
          <button className="btn primary" disabled={!mate || !reason} onClick={send}>Say thanks</button>
        </>
      )}
      <p className="hint" role="status">{msg}</p>
      {s && s.received.length > 0 && <p className="hint">Thanks you got: {s.received.slice(0, 4).map((k) => kindReason(k.reason)?.icon).join(' ')}</p>}
    </main>
  );
}
