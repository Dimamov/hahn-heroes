import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import { ItemGrid } from '../components/ItemGrid.tsx';
import { WEAR_SLOTS, itemById } from '../lib/shop-catalog.ts';
import type { ShopItem, ShopState } from '../lib/backend.ts';

type Tab = 'wardrobe' | 'shop';
type Cat = 'outfit' | 'accessory' | 'decor';
const CATS: { id: Cat; label: string }[] = [{ id: 'outfit', label: 'Outfits' }, { id: 'accessory', label: 'Accessories' }, { id: 'decor', label: 'Room' }];

export function MyHero() {
  const { backend, hero, go, refresh } = useSession();
  const [tab, setTab] = useState<Tab>('wardrobe');
  const [slot, setSlot] = useState<string>('outfit');
  const [cat, setCat] = useState<Cat>('outfit');
  const [state, setState] = useState<ShopState | null>(null);
  const [asking, setAsking] = useState<ShopItem | null>(null);
  const [note, setNote] = useState('');
  const load = useCallback(() => backend.shopState().then(setState).catch(() => setNote("Couldn't load the shop. Please try again.")), [backend]);
  useEffect(() => { load(); }, [load]);

  const wear = async (id: string | null) => { setNote(''); await backend.heroEquip(slot, id).catch(() => setNote("That didn't work.")); load(); };
  const buy = async (item: ShopItem) => {
    setAsking(null);
    const r = await backend.shopBuy(item.id).catch(() => null);
    if (!r) setNote("That didn't work. Please try again.");
    else if (r.ok) setNote(`You got the ${item.name}! 🎉`);
    else setNote(r.reason === 'not_enough_coins' ? 'Not enough points yet. Finish missions and practice to earn more.' : r.reason === 'locked' ? 'Keep learning to unlock that one.' : 'You already have that.');
    await load();
    refresh().catch(() => undefined);
  };

  if (!state) return <main className="screen"><ScreenBar title="My Hero" onBack={() => go('home')} /><div className="spinner" /></main>;
  const worn = state.equipped;
  const wearable = state.items.filter((i) => i.owned && i.slot === slot);
  const shelf = state.items.filter((i) => i.kind === cat);
  return (
    <main className="screen hero-screen">
      <ScreenBar title="My Hero" onBack={() => go('home')} right={<span className="coins" aria-label="Your points">💎 {state.coins}</span>} />
      <div className="hero-stage">
        <HeroArt id={hero.starter} className="stage-hero" />
        <div className="worn" aria-label="Wearing">
          {WEAR_SLOTS.map((s) => <span key={s.id} className="worn-slot" title={s.label}>{worn[s.id] ? itemById(worn[s.id]!)?.icon : <i>{s.icon}</i>}</span>)}
        </div>
      </div>
      <div className="chips">
        <button className={`chip${tab === 'wardrobe' ? ' chosen' : ''}`} onClick={() => setTab('wardrobe')}>Wardrobe</button>
        <button className={`chip${tab === 'shop' ? ' chosen' : ''}`} onClick={() => setTab('shop')}>Shop</button>
      </div>
      {tab === 'wardrobe' ? (
        <>
          <div className="chips">{WEAR_SLOTS.map((s) => <button key={s.id} className={`chip${slot === s.id ? ' chosen' : ''}`} onClick={() => setSlot(s.id)}>{s.label}</button>)}</div>
          <ItemGrid items={[null, ...wearable]} empty="" render={(i) => i === null
            ? <button key="none" className={`item-tile${!worn[slot] ? ' on' : ''}`} onClick={() => wear(null)}><span className="item-icon">🚫</span><b>None</b></button>
            : <button key={i.id} className={`item-tile${worn[slot] === i.id ? ' on' : ''}`} onClick={() => wear(i.id)}><span className="item-icon">{i.icon}</span><b>{i.name}</b><small>{worn[slot] === i.id ? 'Wearing' : 'Tap to wear'}</small></button>} />
          {wearable.length === 0 && <p className="note">You don't own any of these yet. Visit the Shop!</p>}
        </>
      ) : (
        <>
          <div className="chips">{CATS.map((c) => <button key={c.id} className={`chip${cat === c.id ? ' chosen' : ''}`} onClick={() => setCat(c.id)}>{c.label}</button>)}</div>
          <ItemGrid items={shelf} empty="Nothing here yet." render={(i) => (
            <button key={i.id} className={`item-tile${i.owned ? ' owned' : ''}${i.locked && !i.owned ? ' locked' : ''}`} disabled={i.owned || i.locked} onClick={() => setAsking(i)}>
              <span className="item-icon">{i.locked && !i.owned ? '🔒' : i.icon}</span>
              <b>{i.name}</b>
              <small>{i.owned ? 'Owned ✓' : i.locked ? `Needs ${i.unlockXp} XP` : `💎 ${i.price}`}</small>
            </button>
          )} />
        </>
      )}
      <p className="note" role="status">{note}</p>
      {asking && (
        <div className="opicker" role="dialog" aria-label="Buy this item">
          <div className="card">
            <span className="item-icon big">{asking.icon}</span>
            <b>{asking.name}</b>
            <p className="muted">{state.coins >= asking.price ? `Buy for 💎 ${asking.price}?` : `You need 💎 ${asking.price - state.coins} more.`}</p>
            <div className="seg">
              <button onClick={() => setAsking(null)}>Not now</button>
              <button className="chosen" disabled={state.coins < asking.price} onClick={() => buy(asking)}>Buy</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
