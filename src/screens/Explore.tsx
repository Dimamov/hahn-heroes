import { useSession } from '../App.tsx';
import { Pager } from '../components/Pager.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { DESTINATIONS } from '../lib/destinations.ts';

const HIDDEN = new Set(['settings', 'sensei', 'donotpress']);

/** Every area of the Nexus, for when Home's big tiles are not the one you want. */
export function Explore() {
  const { go, questDot, missionDot, arcadeDot } = useSession();
  const list = DESTINATIONS.filter((d) => !HIDDEN.has(d.id));
  const pages = Array.from({ length: Math.ceil(list.length / 9) }, (_, i) => list.slice(i * 9, i * 9 + 9));
  return (
    <main className="screen home" style={{ backgroundImage: 'linear-gradient(180deg, rgba(11,10,36,.55), rgba(11,10,36,.96)), url(/assets/backgrounds/hahn-entrance-tall.webp)' }}>
      <ScreenBar title="All areas" onBack={() => go('home')} />
      <div className="home-pages">
        <Pager
          pages={pages.map((l, p) => (
            <div className="tiles" key={p}>
              {l.map((d) => (
                <button key={d.id} className="tile" style={{ ['--tint' as string]: d.tint }} onClick={() => go(d.id)}>
                  {d.id === 'quest' && questDot && <i className="red-dot" aria-label="Quest rewards waiting" />}
                  {d.id === 'arcade' && arcadeDot && <i className="red-dot" aria-label="Arcade rewards waiting" />}
                  {d.id === 'missions' && missionDot && <i className="red-dot" aria-label="Missions waiting" />}
                  <span className="tile-icon" aria-hidden>{d.icon}</span>
                  <span className="tile-label">{d.label}</span>
                </button>
              ))}
            </div>
          ))}
        />
      </div>
    </main>
  );
}
