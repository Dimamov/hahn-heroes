import { cardById, rarityInfo } from '../lib/cards.ts';

/** A collectible card. Unowned cards show as a mystery. Cards without finished art fall back to their emoji. */
export function CardFace({ id, qty, hidden = false, small = false, onClick, selected = false }: { id: string; qty?: number; hidden?: boolean; small?: boolean; onClick?: () => void; selected?: boolean }) {
  const def = cardById(id);
  if (!def) return null;
  const r = rarityInfo(def.rarity);
  const body = (
    <>
      {!hidden && <img className="tcard-frame" src={`/assets/cards/frame-${def.rarity}.webp`} alt="" draggable={false} />}
      {!hidden && def.art
        ? <img className="tcard-art" src={`/assets/cards/art/${def.art}.webp`} alt="" loading="lazy" draggable={false} />
        : <span className="card-icon">{hidden ? '❔' : def.icon}</span>}
      <b className="card-name">{hidden ? '???' : def.name}</b>
      <small className="card-rarity" style={{ color: r.color }}>{hidden ? '' : r.label}</small>
      {qty !== undefined && qty > 1 && <span className="card-qty">×{qty}</span>}
    </>
  );
  const cls = `tcard${!hidden && def.art ? ' has-art' : ''}${small ? ' small' : ''}${hidden ? ' hidden' : ''}${selected ? ' on' : ''}${def.rarity === 'legendary' ? ' legend' : ''}`;
  const style = { borderColor: hidden ? '#334155' : r.color } as const;
  return onClick
    ? <button className={cls} style={style} onClick={onClick} aria-label={hidden ? 'Undiscovered card' : def.name}>{body}</button>
    : <div className={cls} style={style}>{body}</div>;
}
