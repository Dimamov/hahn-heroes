import { nexlingArt } from '../lib/nexlings.ts';

/** A Nexling's picture. It sizes with the surrounding font size (1em), so it can stand in for the emoji everywhere. */
export function NexlingPic({ type, stage, egg }: { type: string; stage?: number; egg?: boolean }) {
  const art = nexlingArt(type, stage, egg);
  if (!art) return null;
  return <img className="nex-pic" src={art} alt="" draggable={false} />;
}
