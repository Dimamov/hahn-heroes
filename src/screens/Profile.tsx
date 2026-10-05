import { useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import { formatHeroCode } from '../../supabase/functions/_shared/kid-auth.ts';
import type { LookState } from '../lib/look.ts';
import { ParentLinkCard } from '../components/ParentLinkCard.tsx';
import { LookCard } from '../components/LookCard.tsx';
import { titleById, type ShowcaseState } from '../lib/showcase.ts';

export function Profile() {
  const { hero, balances, go, signOut, backend } = useSession();
  const [show, setShow] = useState<ShowcaseState | null>(null);
  const [reveal, setReveal] = useState(false);
  const [look, setLook] = useState<LookState | null>(null);
  useEffect(() => { backend.showcaseState().then(setShow).catch(() => undefined); backend.lookGet().then(setLook).catch(() => undefined); }, [backend]);
  return (
    <main className="screen">
      <header className="bar"><button className="back" onClick={() => go('home')} aria-label="Back to the Nexus">←</button><h2>My Profile</h2></header>
      <div className="profile">
        {look?.pinned ? <LookCard look={look} starter={hero.starter} small /> : <HeroArt id={hero.starter} className={`profile-hero${show ? ` pose-${show.pose}` : ''}`} />}
        <div className="profile-info">
          <strong>{hero.displayName}</strong>
          {show && <span className="title-badge">{titleById(show.title).icon} {titleById(show.title).label}</span>}
          <span>Grade {hero.grade}{look?.pinned ? ` · ❤ ${look.likes}` : ''}</span>
          {reveal
            ? <code aria-label="Your secret sign-in code">{formatHeroCode(hero.heroCode)}</code>
            : <button className="btn link" onClick={() => setReveal(true)}>Show my sign-in code</button>}
          <dl className="stats">
            <div><dt>💎 Nexus points</dt><dd>{balances.coins}</dd></div>
            <div><dt>⭐ XP</dt><dd>{balances.xp}</dd></div>
            <div><dt>🌳 Skill points</dt><dd>{balances.skill_points}</dd></div>
          </dl>
        </div>
      </div>
      <ParentLinkCard compact />
      {backend.mode === 'demo' && <p className="note">Demo mode: this hero lives on this device only.</p>}
      <div className="grow" />
      <div className="btn-grid profile-actions">
        <button className="btn ghost" onClick={() => go('myweek')}>📊 My week</button>
        <button className="btn ghost" onClick={() => go('showcase')}>⭐ Showcase</button>
        <button className="btn ghost" onClick={() => go('studio')}>🎨 Studio</button>
        <button className="btn ghost" onClick={() => go('voice')}>🔊 Voice</button>
        <button className="btn ghost" onClick={() => go('parentcode')}>👪 Grown-up code</button>
        <button className="btn ghost" onClick={() => go('notifications')}>🔔 Alerts</button>
        <button className="btn ghost" onClick={signOut}>Switch hero</button>
        <button className="btn link" onClick={() => go('privacy')}>Privacy and safety</button>
      </div>
    </main>
  );
}
