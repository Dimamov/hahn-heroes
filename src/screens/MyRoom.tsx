import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { ItemGrid } from '../components/ItemGrid.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import { emoteClass } from '../lib/showcase.ts';
import { ROOM_COLS, ROOM_ROWS, itemById } from '../lib/shop-catalog.ts';
import type { DormView, Friends } from '../lib/backend.ts';

type Layout = DormView['layout'];

export function MyRoom() {
  const { backend, go } = useSession();
  const [visiting, setVisiting] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [friends, setFriends] = useState<Friends | null>(null);
  const [room, setRoom] = useState<DormView | null>(null);
  const [layout, setLayout] = useState<Layout>([]);
  const [held, setHeld] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const load = useCallback((who: string | null) => {
    setRoom(null);
    backend.dormGet(who ?? undefined).then((r) => { setRoom(r); setLayout(r.layout); setHeld(null); }).catch(() => { setNote("Couldn't open that room."); setVisiting(null); });
  }, [backend]);
  useEffect(() => { load(visiting); }, [load, visiting]);
  useEffect(() => { if (picking) backend.friends().then(setFriends).catch(() => setFriends({ friends: [], incoming: [], outgoing: [] })); }, [picking, backend]);

  const save = async (next: Layout) => {
    setLayout(next);
    try { await backend.dormSave(next); setNote(''); } catch { setNote("Couldn't save the room. Try again."); }
  };
  const tapCell = (cell: number) => {
    if (!room?.mine) return;
    const here = layout.find((e) => e.cell === cell);
    if (held) {
      // Place (or move) the held item here; a swapped-out item goes back to the tray.
      save([...layout.filter((e) => e.item !== held && e.cell !== cell), { item: held, cell }]);
      setHeld(null);
    } else if (here) setHeld(here.item);
  };
  const putAway = () => { if (held) { save(layout.filter((e) => e.item !== held)); setHeld(null); } };

  if (picking) {
    return (
      <main className="screen">
        <ScreenBar title="Visit a friend" onBack={() => setPicking(false)} />
        {!friends ? <div className="spinner" /> : (
          <ItemGrid perPage={5} items={friends.friends} empty="Add friends from the Squad screen to visit their rooms."
            render={(f) => <button key={f.heroId} className="card clickable" onClick={() => { setPicking(false); setVisiting(f.heroId); }}><b>🚪 {f.name}'s room</b></button>} />
        )}
      </main>
    );
  }
  if (!room) return <main className="screen"><ScreenBar title="My Room" onBack={() => go('home')} /><div className="spinner" /></main>;

  const placed = new Set(layout.map((e) => e.item));
  const tray = (room.owned ?? []).filter((id) => !placed.has(id));
  return (
    <main className="screen room-screen">
      <ScreenBar title={room.mine ? 'My Room' : `${room.name}'s Room`} onBack={() => (room.mine ? go('home') : setVisiting(null))}
        right={room.mine ? <button className="btn small ghost" onClick={() => setPicking(true)}>👥 Visit</button> : undefined} />
      <div className={`room-hero ${emoteClass(room.emote)}`} aria-label={`${room.name} is doing the ${room.emote} emote`}><HeroArt id={room.starter} className="room-hero-art" /></div>
      <div className="dorm" style={{ gridTemplateColumns: `repeat(${ROOM_COLS}, 1fr)`, gridTemplateRows: `repeat(${ROOM_ROWS}, 1fr)` }}>
        {Array.from({ length: ROOM_COLS * ROOM_ROWS }, (_, cell) => {
          const e = layout.find((x) => x.cell === cell);
          const it = e && itemById(e.item);
          return (
            <button key={cell} className={`dorm-cell${held && e?.item === held ? ' held' : ''}${held && !e ? ' target' : ''}`} disabled={!room.mine} onClick={() => tapCell(cell)}
              aria-label={it ? it.name : `Empty spot ${cell + 1}`}>{it?.icon}</button>
          );
        })}
      </div>
      {room.mine ? (
        <>
          <p className="note" role="status">{note || (held ? `Tap a spot for the ${itemById(held)?.name}.` : tray.length ? 'Pick a decoration, then tap a spot.' : 'Buy decorations in the Shop (My Hero).')}</p>
          <ItemGrid perPage={6} items={tray} empty="" render={(id) => {
            const it = itemById(id)!;
            return <button key={id} className={`item-tile small${held === id ? ' on' : ''}`} onClick={() => setHeld(held === id ? null : id)}><span className="item-icon">{it.icon}</span><small>{it.name}</small></button>;
          }} />
          {held && placed.has(held) && <button className="btn ghost" onClick={putAway}>Put it away</button>}
        </>
      ) : <p className="note">You are visiting. Only {room.name} can change this room.</p>}
    </main>
  );
}
