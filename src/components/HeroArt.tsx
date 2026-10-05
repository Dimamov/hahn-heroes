import { heroById } from '../lib/heroes.ts';

export function HeroArt({ id, className = '' }: { id: string; className?: string }) {
  const hero = heroById(id);
  if (hero.hasArt) {
    return <img className={`hero-art ${className}`} src={`/assets/heroes/hero-${hero.id}.webp`} alt={hero.label} draggable={false} />;
  }
  // Placeholder until the finished art arrives: the shared template body, tinted per hero.
  const hue = (hero.id.charCodeAt(1) * 37 + hero.id.charCodeAt(2) * 53) % 360;
  return (
    <div className={`hero-art placeholder ${className}`} aria-label={`${hero.label} (art coming soon)`}>
      <img src={`/assets/template/template-${hero.body}.webp`} alt="" draggable={false} style={{ filter: `sepia(1) saturate(3) hue-rotate(${hue}deg)` }} />
    </div>
  );
}
