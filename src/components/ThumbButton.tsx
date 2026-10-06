import { useEffect, useState } from 'react';
import { useSession } from '../App.tsx';

/** A 👍 on a game's title bar. Tells the Sensei which games kids like; tap again to take it back. */
export function ThumbButton() {
  const { backend, screen } = useSession();
  const game = screen.startsWith('game:') ? screen.slice(5) : null;
  const [up, setUp] = useState<boolean | null>(null);
  useEffect(() => {
    setUp(null);
    if (game) backend.gameThumbs().then((l) => setUp(l.includes(game))).catch(() => setUp(false));
  }, [backend, game]);
  if (!game || up === null) return null;
  const toggle = () => { const next = !up; setUp(next); backend.gameThumb(game, next).catch(() => setUp(!next)); };
  return (
    <button className={`thumb${up ? ' on' : ''}`} onClick={toggle} aria-pressed={up} aria-label={up ? 'You like this game. Tap to undo.' : 'I like this game'}>👍</button>
  );
}
