import { useEffect, useState } from 'react';
import type { ClassLiveOpen } from '../lib/backend.ts';
import { isQuiet } from '../lib/sound.ts';
import { useSession } from '../App.tsx';
import { Pager } from '../components/Pager.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import { WeekRecap } from '../components/WeekRecap.tsx';
import { DESTINATIONS } from '../lib/destinations.ts';

const TILE_ART: Record<string, string> = { arcade: '/assets/ui/nav-arcade.webp', adventures: '/assets/ui/nav-adventures.webp', donotpress: '/assets/games/do-not-press.webp' };

export function Home() {
  const { hero, balances, dailyAvailable, unread, missionDot, arcadeDot, questDot, backend, refresh, go } = useSession();
  const [popped, setPopped] = useState<number | null>(null);
  const [live, setLive] = useState<ClassLiveOpen | null>(null);
  useEffect(() => {
    let stop = false;
    const look = () => backend.classLiveOpen().then((o) => { if (!stop) setLive(o); }).catch(() => undefined);
    void look();
    const id = window.setInterval(look, 8000);
    return () => { stop = true; window.clearInterval(id); };
  }, [backend]);

  const claim = async () => {
    try {
      const r = await backend.claimDaily();
      if (r.awarded > 0) setPopped(r.awarded);
      await refresh();
      setTimeout(() => setPopped(null), 2200);
    } catch { /* the badge stays; the child can tap again */ }
  };

  const pages = Array.from({ length: Math.ceil(DESTINATIONS.length / 9) }, (_, i) => DESTINATIONS.slice(i * 9, i * 9 + 9));
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
      {isQuiet() && <button className="live-banner quiet-banner" onClick={() => go('quiet')}>🤫 Quiet mode is on. Tap to change it</button>}
      {live && <button className="live-banner" onClick={() => go('classlive')}>{live.kind === 'boss' ? '🐲 Your class is fighting a boss! Tap to join' : live.kind === 'mystery' ? '🖼️ Your class mystery is live! Tap to join' : '⚡ Your class quiz battle is live! Tap to join'}</button>}
      {popped !== null && <div className="pop" role="status">+{popped} 💎</div>}
      <WeekRecap />

      <div className="home-pages">
        <Pager
          pages={pages.map((list, p) => (
            <div className="tiles" key={p}>
              {list.map((d) => (
                <button key={d.id} className="tile" style={{ ['--tint' as string]: d.tint }} onClick={() => go(d.id)}>
                  {d.id === 'quest' && questDot && <i className="red-dot" aria-label="Quest rewards waiting" />}
                  {d.id === 'arcade' && arcadeDot && <i className="red-dot" aria-label="Arcade rewards waiting" />}
                  {d.id === 'missions' && missionDot && <i className="red-dot" aria-label="Missions waiting" />}
                  {TILE_ART[d.id] ? <img className="tile-art" src={TILE_ART[d.id]} alt="" draggable={false} /> : <span className="tile-icon" aria-hidden>{d.icon}</span>}
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
