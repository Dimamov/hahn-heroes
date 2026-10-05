import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { ItemGrid } from '../components/ItemGrid.tsx';
import { ROOM_COLS, ROOM_ROWS, itemById } from '../lib/shop-catalog.ts';
import type { BaseView } from '../lib/backend.ts';

/** The squad hideout: a shared room. Everyone places decorations they own; each can move only their own. */
export function SquadBase() {
  const { backend, go } = useSession();
  const [base, setBase] = useState<BaseView | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const load = useCallback(() => { backend.baseGet().then(setBase).catch(() => setBase({ squad: null, items: [], owned: [], limit: 6 })); }, [backend]);
  useEffect(load, [load]);
  const fail = (e: unknown) => setNote(e instanceof Error && e.message ? e.message.replace(/^./, (c) => c.toUpperCase()) + '.' : "That didn't work.");
  const tapCell = async (cell: number) => {
    if (!base) return;
    const here = base.items.find((i) => i.cell === cell);
    if (held) {
      try { await backend.basePlace(cell, held); setHeld(null); setNote(''); load(); } catch (e) { fail(e); }
    } else if (here?.mine) setHeld(here.item);
    else if (here) setNote(`${itemById(here.item)?.name} was placed by ${here.by}.`);
  };
  const putAway = async () => {
    const cell = base?.items.find((i) => i.item === held && i.mine)?.cell;
    if (cell === undefined) return;
    try { await backend.baseRemove(cell); setHeld(null); load(); } catch (e) { fail(e); }
  };
  if (!base) return <main className="screen"><ScreenBar title="Squad Hideout" onBack={() => go('home')} /><div className="spinner" /></main>;
  if (!base.squad) {
    return (
      <main className="screen">
        <ScreenBar title="Squad Hideout" onBack={() => go('home')} />
        <div className="grow" />
        <div className="center-text"><div className="soon-icon" aria-hidden>🏕️</div><p className="hint">Join a squad to share a hideout with your friends.</p></div>
        <div className="grow" />
        <button className="btn primary" onClick={() => go('squad')}>Go to Squad</button>
      </main>
    );
  }
  const placed = new Set(base.items.map((i) => i.item));
  const mine = base.items.filter((i) => i.mine).length;
  const tray = base.owned.filter((id) => !placed.has(id) || base.items.find((i) => i.item === id)?.mine);
  return (
    <main className="screen">
      <ScreenBar title={`${base.squad} Hideout`} onBack={() => go('home')} />
      <div className="dorm base" style={{ gridTemplateColumns: `repeat(${ROOM_COLS}, 1fr)`, gridTemplateRows: `repeat(${ROOM_ROWS}, 1fr)` }}>
        {Array.from({ length: ROOM_COLS * ROOM_ROWS }, (_, cell) => {
          const e = base.items.find((x) => x.cell === cell);
          const it = e && itemById(e.item);
          return <button key={cell} className={`dorm-cell${held && e?.item === held ? ' held' : ''}${held && !e ? ' target' : ''}`} onClick={() => tapCell(cell)} aria-label={it ? `${it.name}, placed by ${e.by}` : `Empty spot ${cell + 1}`}>{it?.icon}</button>;
        })}
      </div>
      <p className="note" role="status">{note || (held ? `Tap a spot for the ${itemById(held)?.name}.` : tray.length ? `Pick a decoration, then tap a spot. You placed ${mine} of ${base.limit}.` : 'Buy decorations in the Shop (My Hero).')}</p>
      <ItemGrid perPage={6} items={tray} empty="" render={(id) => {
        const it = itemById(id)!;
        return <button key={id} className={`item-tile small${held === id ? ' on' : ''}`} onClick={() => { setNote(''); setHeld(held === id ? null : id); }}><span className="item-icon">{it.icon}</span><small>{it.name}</small></button>;
      }} />
      {!held && <button className="btn ghost" onClick={() => go('game:jam')}>🎛️ Jam Session with your squad</button>}
      {held && placed.has(held) && <button className="btn ghost" onClick={putAway}>Put it away</button>}
    </main>
  );
}
