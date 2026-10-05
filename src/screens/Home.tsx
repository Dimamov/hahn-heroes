import { useState } from 'react';
import { useSession } from '../App.tsx';
import { Pager } from '../components/Pager.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import { DESTINATIONS } from '../lib/destinations.ts';

export function Home() {
  const { hero, balances, dailyAvailable, unread, missionDot, arcadeDot, backend, refresh, go } = useSession();
  const [popped, setPopped] = useState<number | null>(null);

  const claim = async () => {
    try {
      const r = await backend.claimDaily();
      if (r.awarded > 0) setPopped(r.awarded);
      await refresh();
      setTimeout(() => setPopped(null), 2200);
    } catch { /* the badge stays; the child can tap again */ }
  };

  const pages = [DESTINATIONS.slice(0, 9), DESTINATIONS.slice(9)];
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

      <div className="home-pages">
        <Pager
          pages={pages.map((list, p) => (
            <div className="tiles" key={p}>
              {list.map((d) => (
                <button key={d.id} className="tile" style={{ ['--tint' as string]: d.tint }} onClick={() => go(d.id)}>
                  {d.id === 'arcade' && arcadeDot && <i className="red-dot" aria-label="Arcade rewards waiting" />}
                  {d.id === 'missions' && missionDot && <i className="red-dot" aria-label="Missions waiting" />}
                  <span className="tile-icon" aria-hidden>{d.icon}</span>
                  <span className="tile-label">{d.label}</span>
                </button>
              ))}
            </div>
          ))}
        />
      </div>
    </main>
  );
}
