import { useSession } from '../App.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import { formatHeroCode } from '../../supabase/functions/_shared/kid-auth.ts';

export function Profile() {
  const { hero, balances, go, signOut, backend } = useSession();
  return (
    <main className="screen">
      <header className="bar"><button className="back" onClick={() => go('home')} aria-label="Back to the Nexus">←</button><h2>My Profile</h2></header>
      <div className="profile">
        <HeroArt id={hero.starter} className="profile-hero" />
        <div className="profile-info">
          <strong>{hero.displayName}</strong>
          <span>Grade {hero.grade}</span>
          <code aria-label="Your hero code">{formatHeroCode(hero.heroCode)}</code>
          <dl className="stats">
            <div><dt>💎 Nexus points</dt><dd>{balances.coins}</dd></div>
            <div><dt>⭐ XP</dt><dd>{balances.xp}</dd></div>
            <div><dt>🌳 Skill points</dt><dd>{balances.skill_points}</dd></div>
          </dl>
        </div>
      </div>
      {backend.mode === 'demo' && <p className="note">Demo mode: this hero lives on this device only.</p>}
      <div className="grow" />
      <button className="btn ghost" onClick={signOut}>Switch hero</button>
    </main>
  );
}
