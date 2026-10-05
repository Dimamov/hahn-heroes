import { useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import { formatHeroCode } from '../../supabase/functions/_shared/kid-auth.ts';
import { titleById, type ShowcaseState } from '../lib/showcase.ts';

export function Profile() {
  const { hero, balances, go, signOut, backend } = useSession();
  const [show, setShow] = useState<ShowcaseState | null>(null);
  const [reveal, setReveal] = useState(false);
  useEffect(() => { backend.showcaseState().then(setShow).catch(() => undefined); }, [backend]);
  return (
    <main className="screen">
      <header className="bar"><button className="back" onClick={() => go('home')} aria-label="Back to the Nexus">←</button><h2>My Profile</h2></header>
      <div className="profile">
        <HeroArt id={hero.starter} className={`profile-hero${show ? ` pose-${show.pose}` : ''}`} />
        <div className="profile-info">
          <strong>{hero.displayName}</strong>
          {show && <span className="title-badge">{titleById(show.title).icon} {titleById(show.title).label}</span>}
          <span>Grade {hero.grade}</span>
          {reveal
            ? <code aria-label="Your secret sign-in code">{formatHeroCode(hero.heroCode)}</code>
            : <button className="btn link" onClick={() => setReveal(true)}>Show my secret sign-in code</button>}
          <dl className="stats">
            <div><dt>💎 Nexus points</dt><dd>{balances.coins}</dd></div>
            <div><dt>⭐ XP</dt><dd>{balances.xp}</dd></div>
            <div><dt>🌳 Skill points</dt><dd>{balances.skill_points}</dd></div>
          </dl>
        </div>
      </div>
      {backend.mode === 'demo' && <p className="note">Demo mode: this hero lives on this device only.</p>}
      <div className="grow" />
      <div className="btn-grid">
        <button className="btn ghost" onClick={() => go('showcase')}>⭐ Showcase</button>
        <button className="btn ghost" onClick={() => go('parentcode')}>👪 Grown-up code</button>
        <button className="btn ghost" onClick={signOut}>Switch hero</button>
        <button className="btn link" onClick={() => go('privacy')}>Privacy and safety</button>
      </div>
    </main>
  );
}
