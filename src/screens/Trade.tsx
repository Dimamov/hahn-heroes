import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { ItemGrid } from '../components/ItemGrid.tsx';
import { CardFace } from '../components/CardFace.tsx';
import { UNEVEN_WARNING, cardById } from '../lib/cards.ts';
import type { CardsState, TradeView } from '../lib/backend.ts';

const MAX_SIDE = 6;
const total = (o: { qty: number }[]) => o.reduce((s, x) => s + x.qty, 0);
const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : '';
  if (m.includes('lopsided')) return "This trade is too lopsided. Make it fairer to go ahead.";
  if (m.includes('do not have')) return "You don't have enough of that card.";
  if (m.includes('closed')) return 'This trade is finished.';
  return "That didn't work. Please try again.";
};

export function TradeScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const { backend, refresh } = useSession();
  const [view, setView] = useState<TradeView | null>(null);
  const [mine, setMine] = useState<CardsState | null>(null);
  const [warn, setWarn] = useState(false);
  const [note, setNote] = useState('');
  const load = useCallback(() => {
    backend.tradeView(id).then(setView).catch(() => setNote('This trade is not available.'));
    backend.cardsState().then(setMine).catch(() => undefined);
  }, [backend, id]);
  useEffect(() => { load(); const t = setInterval(load, 1500); return () => clearInterval(t); }, [load]);

  if (!view || !mine) return <main className="screen"><ScreenBar title="Trade" onBack={onBack} /><p className="note">{note}</p><div className="spinner" /></main>;

  const offered = new Map(view.myOffer.map((o) => [o.card, o.qty]));
  const setOffer = async (card: string, delta: number) => {
    const next = new Map(offered);
    const n = (next.get(card) ?? 0) + delta;
    if (n <= 0) next.delete(card); else next.set(card, n);
    setNote('');
    try { await backend.tradeSet(id, [...next].map(([c, q]) => ({ card: c, qty: q }))); } catch (e) { setNote(errText(e)); }
    load();
  };
  const confirm = async (ack: boolean) => {
    setWarn(false);
    try {
      const r = await backend.tradeConfirm(id, view.ver, ack);
      if (r.done) { setNote('Trade complete! 🎉'); refresh().catch(() => undefined); }
      else if (!r.ok) setNote(r.reason === 'changed' ? 'The offer just changed. Check it again.' : 'Some cards are missing. The trade was reset.');
    } catch (e) { setNote(errText(e)); }
    load();
  };
  const cancel = async () => { await backend.tradeCancel(id).catch(() => undefined); onBack(); };
  const level = view.fairness.level;
  const closed = view.status !== 'open';
  const ownedPicker = mine.cards.filter((c) => c.qty - (offered.get(c.id) ?? 0) > 0);

  if (closed) {
    return (
      <main className="screen center">
        <ScreenBar title="Trade" onBack={onBack} />
        <div className="grow" />
        <div className="soon-icon">{view.status === 'done' ? '🎉' : '✋'}</div>
        <h3>{view.status === 'done' ? 'Trade complete!' : 'Trade cancelled'}</h3>
        {view.status === 'done' && <p className="hint">Check your collection for your new cards.</p>}
        <div className="grow" />
        <button className="btn primary" onClick={onBack}>Back to Cards</button>
      </main>
    );
  }

  const side = (title: string, offer: { card: string; qty: number }[], editable: boolean) => (
    <div className="trade-side">
      <b>{title}</b>
      <div className="trade-cards">
        {offer.length === 0 && <small className="muted">{editable ? 'Pick cards below' : 'Nothing yet'}</small>}
        {offer.map((o) => <button key={o.card} className="mini-card" disabled={!editable} onClick={() => setOffer(o.card, -1)} aria-label={`${cardById(o.card)?.name}${editable ? ', tap to remove one' : ''}`}>{cardById(o.card)?.icon}{o.qty > 1 && <i>×{o.qty}</i>}</button>)}
      </div>
    </div>
  );

  return (
    <main className="screen">
      <ScreenBar title={`Trade with ${view.friend}`} onBack={onBack} right={<button className="btn small ghost" onClick={cancel}>Cancel</button>} />
      <div className="trade-sides">
        {side('You give', view.myOffer, true)}
        {side('You get', view.theirOffer, false)}
      </div>
      {level === 'uneven' && <p className="warn">{view.fairness.iGiveMore ? '⚠️ You are giving more.' : `⚠️ ${view.friend} is giving more.`}</p>}
      {level === 'blocked' && <p className="warn">🚫 Too lopsided. Both sides need cards, and they should be close in value.</p>}
      <p className="note" role="status">{note || (view.iConfirmed ? `Waiting for ${view.friend} to confirm...` : view.theyConfirmed ? `${view.friend} confirmed. Your turn!` : 'Tap a card to add it. Tap it above to take it back.')}</p>
      <ItemGrid perPage={6} items={ownedPicker} empty="You have no cards to offer." render={(c) => (
        <CardFace key={c.id} id={c.id} qty={c.qty - (offered.get(c.id) ?? 0)} small onClick={total(view.myOffer) < MAX_SIDE ? () => setOffer(c.id, 1) : undefined} />
      )} />
      <button className="btn primary" disabled={view.iConfirmed || level === 'empty' || level === 'blocked'} onClick={() => (level === 'uneven' ? setWarn(true) : confirm(false))}>
        {view.iConfirmed ? 'Confirmed ✓' : 'Confirm trade'}
      </button>
      {warn && (
        <div className="opicker" role="dialog" aria-label="Uneven trade">
          <div className="card">
            <span className="item-icon big">⚠️</span>
            <p>{UNEVEN_WARNING}</p>
            <p className="muted">{view.fairness.iGiveMore ? 'You are giving more.' : `${view.friend} is giving more.`}</p>
            <div className="seg"><button onClick={() => setWarn(false)}>Change it</button><button className="chosen" onClick={() => confirm(true)}>Yes, trade</button></div>
          </div>
        </div>
      )}
    </main>
  );
}
