import { useEffect, useState } from 'react';
import type { Backend, SenseiInboxItem } from '../../lib/backend.ts';
import { ScreenBar } from '../../components/ScreenBar.tsx';
import { PagedList } from '../../components/PagedList.tsx';

const ICON = { message: '💬', bug: '🐞', idea: '💡' } as const;
const REWARDS = [10, 25, 50, 100];

/** The Sensei's private inbox: messages, bug reports and ideas from heroes, with a one-tap diamond reward. */
export function SenseiInbox({ backend, onBack }: { backend: Backend; onBack: () => void }) {
  const [items, setItems] = useState<SenseiInboxItem[] | null>(null);
  const [open, setOpen] = useState<SenseiInboxItem | null>(null);
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const load = () => backend.senseiInbox().then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (reward: number, close = false) => {
    if (!open) return;
    try {
      const paid = await backend.senseiMessageResolve(open.id, reward, reply.trim(), close);
      setNote(reward > 0 ? `Sent ${paid} diamonds to ${open.hero}.` : 'Done.');
      setOpen(null); setReply(''); load();
    } catch { setNote("Couldn't do that. Please try again."); }
  };

  if (open) {
    return (
      <main className="screen">
        <ScreenBar title={`${ICON[open.kind]} ${open.hero}`} onBack={() => { setOpen(null); setReply(''); }} />
        <p className="hint">Grade {open.grade} · {open.heroCode}</p>
        <div className="card"><p>{open.body}</p></div>
        {open.reward > 0 && <p className="hint">Already earned {open.reward} diamonds.</p>}
        <label className="field plain"><span>Reply (optional, the hero sees it)</span>
          <input value={reply} maxLength={200} onChange={(e) => setReply(e.target.value)} /></label>
        <div className="chips">
          {REWARDS.map((n) => <button key={n} className="chip" onClick={() => act(n)}>💎 {n}</button>)}
        </div>
        <button className="btn" onClick={() => act(0)}>Thank only</button>
        <button className="btn" onClick={() => act(0, true)}>Close</button>
        <p className="error" role="alert">{note}</p>
      </main>
    );
  }
  return (
    <main className="screen">
      <ScreenBar title="Sensei inbox" onBack={onBack} />
      {note && <p className="hint">{note}</p>}
      {items === null ? <div className="spinner" /> : (
        <PagedList items={items} perPage={4} empty="No messages yet."
          render={(m) => (
            <button className="card" key={m.id} onClick={() => { setOpen(m); setNote(''); }}>
              <div className="card-top"><b>{ICON[m.kind]} {m.hero}</b><small className="muted">{m.status === 'new' ? 'NEW' : m.status === 'rewarded' ? `💎 ${m.reward}` : m.status}</small></div>
              <p>{m.body.length > 90 ? `${m.body.slice(0, 90)}…` : m.body}</p>
            </button>
          )} />
      )}
    </main>
  );
}
