import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import { ItemGrid } from '../components/ItemGrid.tsx';
import { WEAR_SLOTS, itemById } from '../lib/shop-catalog.ts';
import { TREES } from '../lib/skills.ts';
import type { ShopItem, ShopState, SkillState } from '../lib/backend.ts';

const niceDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
type Tab = 'wardrobe' | 'shop' | 'skills';
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
  const [skills, setSkills] = useState<SkillState | null>(null);
  const [tree, setTree] = useState<string>('scholar');
  const load = useCallback(() => backend.shopState().then(setState).catch(() => setNote("Couldn't load the shop. Please try again.")), [backend]);
  const loadSkills = useCallback(() => backend.skillState().then(setSkills).catch(() => setNote("Couldn't load skills.")), [backend]);
  useEffect(() => { load(); loadSkills(); }, [load, loadSkills]);
  const learn = async (id: string, name: string) => {
    const r = await backend.skillLearn(id).catch(() => null);
    setNote(!r ? "That didn't work." : r.ok ? `You learned ${name}! 🎉` : r.reason === 'not_enough_points' ? 'Not enough skill points yet. Right answers in Learn earn them.' : 'Learn the one before it first.');
    loadSkills();
  };

  const wear = async (id: string | null) => { setNote(''); await backend.heroEquip(slot, id).catch(() => setNote("That didn't work.")); load(); };
  const buy = async (item: ShopItem) => {
    setAsking(null);
    const r = await backend.shopBuy(item.id).catch(() => null);
    if (!r) setNote("That didn't work. Please try again.");
    else if (r.ok) setNote(`You got the ${item.name}! 🎉`);
    else setNote(r.reason === 'not_enough_coins' ? 'Not enough points yet. Finish missions and practice to earn more.' : r.reason === 'locked' ? 'Keep learning to unlock that one.' : r.reason === 'event_over' ? 'That event is over for now.' : 'You already have that.');
    await load();
    refresh().catch(() => undefined);
  };

  if (!state) return <main className="screen"><ScreenBar title="My Hero" onBack={() => go('home')} /><div className="spinner" /></main>;
  const worn = state.equipped;
  const wearable = state.items.filter((i) => i.owned && i.slot === slot);
  const shelf = state.items.filter((i) => i.kind === cat).sort((a, b) => Number(!!b.event && !b.owned) - Number(!!a.event && !a.owned));
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
        <button className={`chip${tab === 'skills' ? ' chosen' : ''}`} onClick={() => setTab('skills')}>Skills</button>
      </div>
      {tab === 'skills' ? (
        <>
          <div className="chips">{TREES.map((t) => <button key={t.id} className={`chip${tree === t.id ? ' chosen' : ''}`} onClick={() => setTree(t.id)}>{t.icon} {t.label}</button>)}</div>
          <p className="note">{TREES.find((t) => t.id === tree)?.about} · Skill points: ⭐ {skills?.points ?? 0}</p>
          {skills?.skills.filter((k) => k.tree === tree).map((k) => (
            <button key={k.id} className={`card skill-row${k.learned ? ' learned' : ''}${!k.ready && !k.learned ? ' locked' : ''}`} disabled={k.learned || !k.ready} onClick={() => learn(k.id, k.name)}>
              <span className="item-icon">{k.icon}</span>
              <span className="grow"><b>{k.name}</b><br /><small className="muted">{k.blurb}</small></span>
              <b>{k.learned ? '✓' : `⭐ ${k.cost}`}</b>
            </button>
          ))}
        </>
      ) : tab === 'wardrobe' ? (
        <>
          <div className="chips">{WEAR_SLOTS.map((s) => <button key={s.id} className={`chip${slot === s.id ? ' chosen' : ''}`} onClick={() => setSlot(s.id)}>{s.label}</button>)}</div>
          <ItemGrid items={[null, ...wearable]} empty="" render={(i) => i === null
            ? <button key="none" className={`item-tile${!worn[slot] ? ' on' : ''}`} onClick={() => wear(null)}><span className="item-icon">🚫</span><b>None</b></button>
            : <button key={i.id} className={`item-tile${worn[slot] === i.id ? ' on' : ''}`} onClick={() => wear(i.id)}><span className="item-icon">{i.icon}</span><b>{i.name}</b><small>{worn[slot] === i.id ? 'Wearing' : 'Tap to wear'}</small></button>} />
          {wearable.length === 0 && <p className="note">You don't own any of these yet. Visit the Shop!</p>}
        </>
      ) : (
        <>
          {state.events.map((e) => <p key={e.id} className="event-banner" role="status">{e.icon} <b>{e.name}</b> · {e.live ? `limited items until ${niceDate(e.ends)}` : `starts ${niceDate(e.starts)}`}</p>)}
          <div className="chips">{CATS.map((c) => <button key={c.id} className={`chip${cat === c.id ? ' chosen' : ''}`} onClick={() => setCat(c.id)}>{c.label}</button>)}</div>
          <ItemGrid items={shelf} empty="Nothing here yet." render={(i) => (
            <button key={i.id} className={`item-tile${i.owned ? ' owned' : ''}${i.locked && !i.owned ? ' locked' : ''}`} disabled={i.owned || i.locked} onClick={() => setAsking(i)}>
              <span className="item-icon">{i.locked && !i.owned ? '🔒' : i.icon}</span>
              <b>{i.name}</b>
              <small>{i.owned ? 'Owned ✓' : i.locked ? `Needs ${i.unlockXp} XP` : `💎 ${i.price}${i.event ? ' · ⏳ Limited' : ''}`}</small>
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
