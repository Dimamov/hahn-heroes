import { HeroArt } from './HeroArt.tsx';
import { MAKEUP, auraColor, hairColor, type Look } from '../lib/look.ts';
import { itemById } from '../lib/shop-catalog.ts';

/** A hero's look: their art in an aura, with the hair colour, makeup, outfit and accessory shown as badges. */
export function LookCard({ look, starter, name, small = false }: { look: Look; starter: string; name?: string; small?: boolean }) {
  const color = auraColor(look.aura);
  const makeup = MAKEUP.find((m) => m.id === look.makeup);
  return (
    <div className={`look-card${small ? ' small' : ''}`} aria-label={`${name ?? 'Look'}: ${look.hair} hair, ${look.makeup} makeup, ${look.aura} aura`}>
      <div className={`look-aura aura-${look.aura}`} style={{ ['--aura' as string]: color }}><HeroArt id={starter} className="look-hero" /></div>
      <div className="look-badges">
        <i className="look-hair" style={{ background: hairColor(look.hair) }} title={`${look.hair} hair`} />
        {makeup?.icon && <span title={`${makeup.label} makeup`}>{makeup.icon}</span>}
        {look.outfit && <span title={itemById(look.outfit)?.name}>{itemById(look.outfit)?.icon}</span>}
        {look.accessory && <span title={itemById(look.accessory)?.name}>{itemById(look.accessory)?.icon}</span>}
      </div>
      {name && <b className="look-name">{name}</b>}
    </div>
  );
}
