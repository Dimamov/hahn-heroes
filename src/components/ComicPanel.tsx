import { HeroArt } from './HeroArt.tsx';
import { sceneColor, type ComicPanelData } from '../lib/comics.ts';

/** One comic panel: a scene colour, a hero in a pose and a speech bubble. */
export function ComicPanel({ p }: { p: ComicPanelData }) {
  return (
    <div className={`comic-panel scene-${p.scene}`} style={{ background: `linear-gradient(180deg, ${sceneColor(p.scene)}, #1a1440)` }}>
      <HeroArt id={p.hero} className={`comic-hero pose-${p.pose}`} />
      <b className="comic-bubble">{p.line}</b>
    </div>
  );
}

export function ComicStrip({ panels }: { panels: ComicPanelData[] }) {
  return <div className="comic-strip">{panels.map((p, i) => <ComicPanel key={i} p={p} />)}</div>;
}
