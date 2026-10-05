import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { ItemGrid } from '../components/ItemGrid.tsx';
import { CardFace } from '../components/CardFace.tsx';
import { CARDS, RARITIES, cardById, rarityInfo } from '../lib/cards.ts';
import type { CardsState, Friends, PackResult, TradeListItem } from '../lib/backend.ts';
import { TradeScreen } from './Trade.tsx';

const order = (id: string) => RARITIES.findIndex((r) => r.id === cardById(id)!.rarity) * 1000 + CARDS.findIndex((c) => c.id === id);

export function Cards() {
  const { backend, go, refresh } = useSession();
  const [tab, setTab] = useState<'cards' | 'trade'>('cards');
  const [state, setState] = useState<CardsState | null>(null);
  const [friends, setFriends] = useState<Friends | null>(null);
  const [trades, setTrades] = useState<TradeListItem[]>([]);
  const [detail, setDetail] = useState<string | null>(null);
  const [pack, setPack] = useState<PackResult | null>(null);
  const [flipped, setFlipped] = useState<boolean[]>([]);
  const [trading, setTrading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    backend.cardsState().then(setState).catch(() => setState({ packs: 0, cards: [], showcase: [], total: CARDS.length }));
    backend.tradeList().then(setTrades).catch(() => setTrades([]));
  }, [backend]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'trade') backend.friends().then(setFriends).catch(() => setFriends({ friends: [], incoming: [], outgoing: [] })); }, [tab, backend]);

  if (trading) return <TradeScreen id={trading} onBack={() => { setTrading(null); load(); }} />;
  if (!state) return <main className="screen"><ScreenBar title="Cards" onBack={() => go('home')} /><div className="spinner" /></main>;

  const qty = new Map(state.cards.map((c) => [c.id, c.qty]));
  const all = [...CARDS].sort((a, b) => order(a.id) - order(b.id));
  const open = async () => {
    setError('');
    try { const r = await backend.openPack(); setPack(r); setFlipped([false, false, false]); load(); refresh().catch(() => undefined); } catch { setError('No packs to open right now.'); }
  };
  const toggleFav = async (id: string) => {
    const has = state.showcase.includes(id);
    const next = has ? state.showcase.filter((x) => x !== id) : [...state.showcase, id].slice(-3);
    await backend.setShowcase(next).catch(() => setError("Couldn't save favourites."));
    load();
  };
  const startTrade = async (friendId: string) => { try { setTrading(await backend.tradeOpen(friendId)); } catch { setError("Couldn't start that trade."); } };

  return (
    <main className="screen">
      <ScreenBar title="Cards" onBack={() => go('home')} right={<button className="btn small primary" disabled={state.packs <= 0} onClick={open}>🎁 Pack ({state.packs})</button>} />
      <div className="chips">
        <button className={`chip${tab === 'cards' ? ' chosen' : ''}`} onClick={() => setTab('cards')}>Collection {state.cards.length}/{state.total}</button>
        <button className={`chip${tab === 'trade' ? ' chosen' : ''}`} onClick={() => setTab('trade')}>Trade{trades.length ? ` (${trades.length})` : ''}</button>
      </div>
      <p className="error" role="alert">{error}</p>
      {tab === 'cards' ? (
        <>
          {state.showcase.length > 0 && <div className="showcase" aria-label="Favourites">{state.showcase.map((id) => <CardFace key={id} id={id} small />)}</div>}
          <ItemGrid items={all} empty="" render={(c) => <CardFace key={c.id} id={c.id} qty={qty.get(c.id)} hidden={!qty.get(c.id)} onClick={qty.get(c.id) ? () => setDetail(c.id) : undefined} />} />
        </>
      ) : (
        <>
          {trades.length > 0 && <p className="note">Waiting trades</p>}
          {trades.slice(0, 2).map((t) => <button key={t.id} className="card clickable" onClick={() => setTrading(t.id)}><b>🔁 Trade with {t.friend}</b></button>)}
          <p className="note">Start a trade with a friend</p>
          <ItemGrid perPage={4} items={friends?.friends ?? []} empty="Add friends from the Squad screen to trade cards." render={(f) => <button key={f.heroId} className="card clickable" onClick={() => startTrade(f.heroId)}><b>🤝 {f.name}</b></button>} />
        </>
      )}
      {detail && (() => {
        const def = cardById(detail)!;
        const r = rarityInfo(def.rarity);
        return (
          <div className="opicker" role="dialog" aria-label={def.name} onClick={() => setDetail(null)}>
            <div className="card" onClick={(e) => e.stopPropagation()}>
              <span className="item-icon big">{def.icon}</span>
              <b>{def.name}</b>
              <small style={{ color: r.color }}>{r.label}{(qty.get(detail) ?? 0) > 1 ? ` · you have ${qty.get(detail)}` : ''}</small>
              <p className="muted">{def.flavor}</p>
              <div className="seg">
                <button onClick={() => setDetail(null)}>Close</button>
                <button className={state.showcase.includes(detail) ? 'chosen' : ''} onClick={() => toggleFav(detail)}>{state.showcase.includes(detail) ? '★ Favourite' : '☆ Favourite'}</button>
              </div>
            </div>
          </div>
        );
      })()}
      {pack && (
        <div className="opicker pack" role="dialog" aria-label="Open your pack">
          <div className="card">
            <b>Tap each card to reveal it!</b>
            <div className="pack-row">
              {pack.cards.map((c, i) => (
                <button key={i} className={`flip${flipped[i] ? ' open' : ''}`} onClick={() => setFlipped(flipped.map((f, j) => (j === i ? true : f)))} aria-label={flipped[i] ? cardById(c.id)?.name : 'Hidden card'}>
                  <span className="flip-back">🎴</span>
                  <span className="flip-front"><CardFace id={c.id} small />{c.new && <em className="new-badge">NEW!</em>}</span>
                </button>
              ))}
            </div>
            <button className="btn primary" disabled={!flipped.every(Boolean)} onClick={() => { setPack(null); load(); }}>{flipped.every(Boolean) ? 'Nice!' : 'Reveal all three'}</button>
          </div>
        </div>
      )}
    </main>
  );
}
