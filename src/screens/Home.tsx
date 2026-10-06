import { useEffect, useState, type ReactNode } from 'react';
import type { ClassLiveOpen } from '../lib/backend.ts';
import { isQuiet } from '../lib/sound.ts';
import { useSession } from '../App.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import { WeekRecap } from '../components/WeekRecap.tsx';

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

  const level = Math.floor(balances.xp / 100) + 1;
  const into = balances.xp % 100;
  const squad = ['ana', 'luna', hero.starter, 'b02', 'g07'].filter((id, n, a) => a.indexOf(id) === n || n === 2).slice(0, 5);
  if (squad.length === 5 && squad[2] !== hero.starter) squad[2] = hero.starter;
  const tile = (id: string, label: string, sub: string, art: ReactNode, tint: string, dot = false) => (
    <button key={id} className="art-tile" style={{ ['--tint' as string]: tint }} onClick={() => go(id)}>
      {dot && <i className="red-dot" aria-label="Something is waiting" />}
      <span className="art-tile-art" aria-hidden>{art}</span>
      <span className="art-tile-text"><b>{label}</b>{sub && <small>{sub}</small>}</span>
      <span className="art-tile-go" aria-hidden>›</span>
    </button>
  );
  const img = (src: string) => <img src={src} alt="" draggable={false} />;
  return (
    <main className="screen live home2">
      <section className="home-hero" style={{ backgroundImage: 'linear-gradient(180deg, rgba(11,10,36,.15), rgba(11,10,36,.9)), url(/assets/backgrounds/hahn-entrance-tall.webp)' }}>
        <header className="home-top">
          <button className="hero-chip level-chip" onClick={() => go('profile')} aria-label="My profile">
            <HeroArt id={hero.starter} className="chip-hero" />
            <span><b>Level {level}</b><i className="xp-track"><i style={{ width: `${into}%` }} /></i><small>⭐ {balances.xp} · 💎 {balances.coins}</small></span>
          </button>
          <button className="bell" onClick={() => go('announcements')} aria-label={unread ? `${unread} new announcements` : 'Announcements'}>
            📣{unread > 0 && <i className="red-dot" />}
          </button>
          <button className="bell gear" onClick={() => go('profile')} aria-label="My profile and settings">⚙️</button>
        </header>
        <div className="home-logo">
          <img src="/assets/brand/emblem-hahn.webp" alt="" draggable={false} />
          <h1>H.A.H.N.</h1>
          <small>Heroes Awakening: Hidden Nexus</small>
        </div>
        <div className="home-squad" aria-hidden>{squad.map((id, n) => <span key={id} className={n === 2 ? 'lead' : ''}><HeroArt id={id} /></span>)}</div>
      </section>

      {dailyAvailable && <button className="daily ready" onClick={claim}><i className="red-dot" aria-label="Reward waiting" />🎁 Collect your daily Nexus points</button>}
      {popped !== null && <div className="pop" role="status">+{popped} 💎</div>}
      <WeekRecap />
      {isQuiet() && <button className="live-banner quiet-banner" onClick={() => go('quiet')}>🤫 Quiet mode is on. Tap to change it</button>}
      {live && <button className="live-banner" onClick={() => go('classlive')}>{live.kind === 'boss' ? '🐲 Your class is fighting a boss! Tap to join' : live.kind === 'mystery' ? '🖼️ Your class mystery is live! Tap to join' : live.kind === 'duel' ? '⚔️ A vocab duel is starting! Tap to join' : '⚡ Your class quiz battle is live! Tap to join'}</button>}

      <button className="feature-banner" onClick={() => go('arcade')}>
        {arcadeDot && <i className="red-dot" aria-label="Arcade rewards waiting" />}
        <span className="feature-pad" aria-hidden>🎮</span>
        <span className="feature-text"><b>Arcade</b><small>Solo / Squad</small></span>
        <img className="feature-art" src="/assets/ui/nav-arcade.webp" alt="" draggable={false} />
        <span className="art-tile-go" aria-hidden>›</span>
      </button>

      <div className="art-tiles">
        {tile('learn', 'Learn', 'Math · Words · Reading', <span className="art-emoji">🧠</span>, '#34d399')}
        {tile('hero', 'Character Lab', '', <HeroArt id={hero.starter} />, '#38bdf8')}
        {tile('missions', 'Nexus Missions', 'Home / Class', img('/assets/backgrounds/hahn-entrance-tall.webp'), '#34d399', missionDot)}
        {tile('adventures', 'Story Episodes', '', img('/assets/ui/nav-adventures.webp'), '#fb923c')}
        {tile('treasure', 'Mystery Solver', '', img('/assets/games/escape-room-02-wide.webp'), '#8b5cff')}
        {tile('game:fun-box', 'Fun Box', '', img('/assets/games/fun-box-open.webp'), '#22d3ee')}
        {tile('donotpress', 'Do Not Press', '', img('/assets/games/do-not-press.webp'), '#ef4444')}
        {tile('explore', 'All areas', 'Squad · House · Cards', <span className="art-emoji">🧭</span>, '#a78bfa', questDot)}
      </div>

      <button className="sensei-bar" onClick={() => go('sensei')}>
        <span className="sensei-face" aria-hidden>🧙</span>
        <span><b>Contact the Sensei</b><small>Questions? Need help? I&apos;m here.</small></span>
        <span className="art-tile-go" aria-hidden>›</span>
      </button>
    </main>
  );
}
