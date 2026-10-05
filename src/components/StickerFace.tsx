import { HeroArt } from './HeroArt.tsx';
import { bgColor, type StickerDesign } from '../lib/stickers.ts';

/** One sticker: hero art on a colour, with a frame, a decoration and a short word. */
export function StickerFace({ s, small = false, selected = false, onClick }: { s: StickerDesign; small?: boolean; selected?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <HeroArt id={s.hero} className="sticker-hero" />
      <span className="sticker-deco" aria-hidden>{s.deco}</span>
      <b className="sticker-word">{s.word}</b>
    </>
  );
  const cls = `sticker frame-${s.frame}${small ? ' small' : ''}${selected ? ' selected' : ''}`;
  const style = { background: `radial-gradient(circle at 50% 30%, ${bgColor(s.bg)}, #1a1440)` };
  return onClick
    ? <button className={cls} style={style} onClick={onClick} aria-label={`Sticker: ${s.word}`}>{body}</button>
    : <div className={cls} style={style}>{body}</div>;
}
