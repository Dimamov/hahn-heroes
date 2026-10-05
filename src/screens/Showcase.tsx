import { useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import { Pager } from '../components/Pager.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { EMOTES, POSES, TITLES, emoteClass, titleById, type ShowcaseState } from '../lib/showcase.ts';

/** Pick a badge title and a pose for the profile. Locked titles say how to earn them. */
export function Showcase() {
  const { backend, hero, go } = useSession();
  const [s, setS] = useState<ShowcaseState | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => { backend.showcaseState().then(setS).catch(() => setNote("Couldn't load your showcase.")); }, [backend]);

  const pick = async (title: string, pose: string) => {
    if (!s) return;
    const before = s;
    setS({ ...s, title, pose: pose as ShowcaseState['pose'] });
    try { await backend.showcaseSet(title, pose); setNote(''); } catch { setS(before); setNote("That isn't unlocked yet."); }
  };
  const pickEmote = async (id: string) => {
    if (!s) return;
    const before = s;
    setS({ ...s, emote: id as ShowcaseState['emote'] });
    try { await backend.emoteSet(id); setNote(''); } catch { setS(before); setNote('Earn more XP to unlock that emote.'); }
  };
  if (!s) return <main className="screen"><ScreenBar title="Showcase" onBack={() => go('profile')} /><div className="spinner" /></main>;
  const t = titleById(s.title);
  return (
    <main className="screen showcase">
      <ScreenBar title="Showcase" onBack={() => go('profile')} />
      <div className="showcase-stage">
        <div className={emoteClass(s.emote)}><HeroArt id={hero.starter} className={`profile-hero pose-${s.pose}`} /></div>
        <b className="title-badge">{t.icon} {t.label}</b>
      </div>
      <div className="paged">
        <Pager pages={[
          ...[TITLES.slice(0, 4), TITLES.slice(4)].map((group, g) => (
            <div className="list-page" key={`titles${g}`}>
              <h3 className="page-title">Badge titles {g + 1}/2</h3>
              <div className="title-grid">
                {group.map((x) => {
                  const open = s.unlocked.includes(x.id);
                  return (
                    <button key={x.id} className={`chip title-chip${s.title === x.id ? ' chosen' : ''}`} disabled={!open} onClick={() => pick(x.id, s.pose)}>
                      <span aria-hidden>{open ? x.icon : '🔒'}</span> {x.label}
                      {!open && <small>{x.hint}</small>}
                    </button>
                  );
                })}
              </div>
            </div>
          )),
          <div className="list-page" key="emotes">
            <h3 className="page-title">Emotes</h3>
            <div className="title-grid">
              {EMOTES.map((e) => {
                const open = s.xp >= e.xp;
                return (
                  <button key={e.id} className={`chip title-chip${s.emote === e.id ? ' chosen' : ''}`} disabled={!open} onClick={() => pickEmote(e.id)}>
                    <span aria-hidden>{open ? e.icon : '🔒'}</span> {e.label}
                    {!open && <small>Reach {e.xp} XP</small>}
                  </button>
                );
              })}
            </div>
            <p className="note">Your emote plays in your room, even when friends visit.</p>
          </div>,
          <div className="list-page" key="poses">
            <h3 className="page-title">Poses</h3>
            <div className="chips">{POSES.map((p) => <button key={p.id} className={`chip${s.pose === p.id ? ' chosen' : ''}`} onClick={() => pick(s.title, p.id)}>{p.label}</button>)}</div>
            <p className="note">Poses use your hero's picture for now. New pose art is coming.</p>
          </div>,
        ]} />
      </div>
      <p className="note" role="status">{note}</p>
    </main>
  );
}
