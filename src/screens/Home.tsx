import { useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import { WeekRecap } from '../components/WeekRecap.tsx';
import { DESTINATIONS } from '../lib/destinations.ts';

const TILE_ART: Record<string, string> = { arcade: '/assets/ui/nav-arcade.webp', adventures: '/assets/ui/nav-adventures.webp', donotpress: '/assets/games/do-not-press.webp' };

/** The six things kids reach for most. Everything else lives behind one big button. */
const MAIN = ['learn', 'arcade', 'adventures', 'missions', 'hero', 'nexlings'];

export function Home() {
  const { hero, balances, dailyAvailable, unread, missionDot, arcadeDot, questDot, backend, refresh, go } = useSession();
  const [more, setMore] = useState(false);
  const [popped, setPopped] = useState<number | null>(null);

  const claim = async () => {
    try {
      const r = await backend.claimDaily();
      if (r.awarded > 0) setPopped(r.awarded);
      await refresh();
      setTimeout(() => setPopped(null), 2200);
    } catch { /* the badge stays; the child can tap again */ }
  };

  const main = MAIN.map((id) => DESTINATIONS.find((d) => d.id === id)!).filter(Boolean);
  const rest = DESTINATIONS.filter((d) => !MAIN.includes(d.id));
  const tile = (d: (typeof DESTINATIONS)[number]) => (
    <button key={d.id} className="tile" style={{ ['--tint' as string]: d.tint }} onClick={() => go(d.id)}>
      {d.id === 'quest' && questDot && <i className="red-dot" aria-label="Quest rewards waiting" />}
      {d.id === 'arcade' && arcadeDot && <i className="red-dot" aria-label="Arcade rewards waiting" />}
      {d.id === 'missions' && missionDot && <i className="red-dot" aria-label="Missions waiting" />}
      {TILE_ART[d.id] ? <img className="tile-art" src={TILE_ART[d.id]} alt="" draggable={false} /> : <span className="tile-icon" aria-hidden>{d.icon}</span>}
      <span className="tile-label">{d.label}</span>
    </button>
  );
  if (more) {
    return (
      <main className="screen">
        <ScreenBar title="More to explore" onBack={() => setMore(false)} />
        <div className="tiles more">{rest.map((d) => tile(d))}</div>
      </main>
    );
  }
  return (
    <main className="screen home" style={{ backgroundImage: 'linear-gradient(180deg, rgba(11,10,36,.55), rgba(11,10,36,.96)), url(/assets/backgrounds/hahn-entrance-tall.webp)' }}>
      <header className="home-top">
        <button className="hero-chip" onClick={() => go('profile')} aria-label="My profile">
          <HeroArt id={hero.starter} className="chip-hero" />
          <span><b>{hero.displayName}</b><small>Grade {hero.grade}</small></span>
        </button>
        <button className="bell" onClick={() => go('announcements')} aria-label={unread ? `${unread} new announcements` : 'Announcements'}>
          📣{unread > 0 && <i className="red-dot" />}
        </button>
        <div className="coins" aria-label={`${balances.coins} Nexus points`}>💎 {balances.coins}</div>
      </header>

      <button className={`daily${dailyAvailable ? ' ready' : ''}`} onClick={claim} disabled={!dailyAvailable}>
        {dailyAvailable && <i className="red-dot" aria-label="Reward waiting" />}
        {dailyAvailable ? '🎁 Collect your daily Nexus points' : '✅ Daily check-in collected'}
      </button>
      {popped !== null && <div className="pop" role="status">+{popped} 💎</div>}
      <WeekRecap />

      <div className="tiles big">
        {main.map((d) => tile(d))}
      </div>
      <button className="more-btn" onClick={() => setMore(true)}>
        {questDot && <i className="red-dot" aria-label="Quest rewards waiting" />}
        ✨ More to explore
      </button>
    </main>
  );
}
