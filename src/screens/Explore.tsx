import { useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { DESTINATIONS } from '../lib/destinations.ts';

const FOLDERS = [
  { id: 'play', label: 'Play', icon: '🎮', tint: '#ff3fa4', sub: 'Games, bosses and hunts', ids: ['arcade', 'adventures', 'raid', 'secret', 'treasure', 'goofy', 'race'] },
  { id: 'create', label: 'Create', icon: '🎨', tint: '#f472b6', sub: 'Studio, comics, rooms', ids: ['studio', 'stickers', 'comics', 'room', 'contest'] },
  { id: 'learn', label: 'School', icon: '📚', tint: '#34d399', sub: 'Learn, quests, class', ids: ['learn', 'quest', 'missions', 'classlive', 'quiet', 'codes'] },
  { id: 'me', label: 'Me & Friends', icon: '🦸', tint: '#38bdf8', sub: 'Hero, squad, cards', ids: ['hero', 'nexlings', 'cards', 'squad', 'house', 'base', 'kindness', 'badges', 'guide'] },
] as const;

/** Every area of the Nexus in four folders. Each folder is one screen with no scrolling. */
export function Explore() {
  const { go, questDot, missionDot, arcadeDot } = useSession();
  const [open, setOpen] = useState<string | null>(null);
  const folder = FOLDERS.find((f) => f.id === open);
  const dot = (id: string) => (id === 'quest' && questDot) || (id === 'arcade' && arcadeDot) || (id === 'missions' && missionDot);
  return (
    <main className="screen">
      <ScreenBar title={folder ? folder.label : 'All areas'} onBack={() => (folder ? setOpen(null) : go('home'))} />
      {!folder ? (
        <div className="explore-folders">
          {FOLDERS.map((f) => (
            <button key={f.id} className="explore-folder" style={{ ['--tint' as string]: f.tint }} onClick={() => setOpen(f.id)}>
              {f.ids.some(dot) && <i className="red-dot" aria-label="Something is waiting" />}
              <span className="explore-icon" aria-hidden>{f.icon}</span>
              <b>{f.label}</b>
              <small>{f.sub}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="tiles fit">
          {folder.ids.map((id) => {
            const d = DESTINATIONS.find((x) => x.id === id)!;
            return (
              <button key={d.id} className="tile" style={{ ['--tint' as string]: d.tint }} onClick={() => go(d.id)}>
                {dot(d.id) && <i className="red-dot" aria-label="Something is waiting" />}
                <span className="tile-icon" aria-hidden>{d.icon}</span>
                <span className="tile-label">{d.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}
