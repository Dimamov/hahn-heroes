import { useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { ItemGrid } from '../components/ItemGrid.tsx';
import { BADGES, type Badge } from '../lib/badges.ts';

/** The achievement wall: fun, silly badges. Locked ones show how to get them. */
export function Badges() {
  const { backend, go } = useSession();
  const [earned, setEarned] = useState<string[] | null>(null);
  const [pick, setPick] = useState<Badge | null>(null);
  useEffect(() => { backend.badgeWall().then(setEarned).catch(() => setEarned([])); }, [backend]);
  const has = (id: string) => !!earned?.includes(id);
  return (
    <main className="screen">
      <ScreenBar title="Achievement Wall" onBack={() => go('home')} />
      {!earned ? <div className="spinner" /> : (
        <>
          <p className="hint">{earned.length} of {BADGES.length} badges</p>
          <ItemGrid perPage={6} items={BADGES} empty="" render={(b) => (
            <button key={b.id} className={`item-tile small badge${has(b.id) ? ' on' : ' locked'}${pick?.id === b.id ? ' picked' : ''}`} onClick={() => setPick(b)} aria-label={`${b.name}${has(b.id) ? ', earned' : ', locked'}`}>
              <span className="item-icon">{has(b.id) ? b.icon : '🔒'}</span><small>{b.name}</small>
            </button>
          )} />
          <p className="note" role="status">{pick ? `${pick.name}: ${pick.how}${has(pick.id) ? ' ✓' : ''}` : 'Tap a badge to see how to get it.'}</p>
        </>
      )}
    </main>
  );
}
