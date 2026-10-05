import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { Pager } from '../components/Pager.tsx';
import { ItemGrid } from '../components/ItemGrid.tsx';
import { LookCard } from '../components/LookCard.tsx';
import { AURAS, DEFAULT_LOOK, HAIR, MAKEUP, type GalleryLook, type Look, type LookState } from '../lib/look.ts';
import { itemById } from '../lib/shop-catalog.ts';

/** Avatar studio: mix a look, pin it to your profile, and like looks from friends, squad and House. */
export function Studio() {
  const { backend, hero, go } = useSession();
  const [tab, setTab] = useState<'mine' | 'gallery'>('mine');
  const [state, setState] = useState<LookState | null>(null);
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const [pinned, setPinned] = useState(false);
  const [gallery, setGallery] = useState<GalleryLook[] | null>(null);
  const [note, setNote] = useState('');
  const load = useCallback(() => {
    backend.lookGet().then((s) => { setState(s); setLook({ hair: s.hair, makeup: s.makeup, aura: s.aura, outfit: s.outfit, accessory: s.accessory }); setPinned(s.pinned); }).catch(() => setNote("Couldn't open the studio."));
    backend.lookGallery().then(setGallery).catch(() => setGallery([]));
  }, [backend]);
  useEffect(load, [load]);
  const set = <K extends keyof Look>(k: K, v: Look[K]) => setLook({ ...look, [k]: v });
  const save = async () => { try { await backend.lookSave(look, pinned); setNote(pinned ? 'Saved and pinned to your profile! ✨' : 'Saved!'); load(); } catch { setNote("That didn't save. Try again."); } };
  const like = async (g: GalleryLook) => { try { await backend.lookLike(g.hero); load(); } catch { setNote("That didn't work."); } };
  const page = (title: string, body: React.ReactNode) => <div className="list-page" key={title}><h3 className="page-title">{title}</h3>{body}</div>;
  const chip = (on: boolean, label: React.ReactNode, onClick: () => void, key: string) => <button key={key} className={`chip${on ? ' chosen' : ''}`} onClick={onClick}>{label}</button>;

  return (
    <main className="screen studio">
      <ScreenBar title="Avatar Studio" onBack={() => go('profile')} />
      <div className="chips"><button className={`chip${tab === 'mine' ? ' chosen' : ''}`} onClick={() => setTab('mine')}>My look</button><button className={`chip${tab === 'gallery' ? ' chosen' : ''}`} onClick={() => setTab('gallery')}>Friends' looks</button></div>
      {!state ? <div className="spinner" /> : tab === 'mine' ? (
        <>
          <LookCard look={look} starter={hero.starter} />
          <div className="paged">
            <Pager pages={[
              page('Hair colour', <div className="chips">{HAIR.map((h) => <button key={h.id} aria-label={`${h.id} hair`} className={`chip${look.hair === h.id ? ' chosen' : ''}`} style={{ background: h.color, width: 38, height: 38, padding: 0 }} onClick={() => set('hair', h.id)} />)}</div>),
              page('Makeup', <div className="chips">{MAKEUP.map((m) => chip(look.makeup === m.id, `${m.icon} ${m.label}`.trim(), () => set('makeup', m.id), m.id))}</div>),
              page('Aura', <div className="chips">{AURAS.map((a) => chip(look.aura === a.id, a.label, () => set('aura', a.id), a.id))}</div>),
              page('Outfit', <div className="chips">{chip(look.outfit === null, 'None', () => set('outfit', null), 'none')}{state.outfits.map((id) => chip(look.outfit === id, `${itemById(id)?.icon} ${itemById(id)?.name}`, () => set('outfit', id), id))}{!state.outfits.length && <small className="muted">Buy outfits in the Shop (My Hero).</small>}</div>),
              page('Accessory', <div className="chips">{chip(look.accessory === null, 'None', () => set('accessory', null), 'none')}{state.accessories.map((id) => chip(look.accessory === id, `${itemById(id)?.icon} ${itemById(id)?.name}`, () => set('accessory', id), id))}{!state.accessories.length && <small className="muted">Buy accessories in the Shop (My Hero).</small>}</div>),
            ]} />
          </div>
          <label className="check"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Pin to my profile (friends, squad and House can like it)</label>
          <p className="note" role="status">{note || (state.pinned ? `❤ ${state.likes} like${state.likes === 1 ? '' : 's'}` : '')}</p>
          <button className="btn primary" onClick={save}>Save my look</button>
        </>
      ) : (
        <>
          {!gallery ? <div className="spinner" /> : (
            <ItemGrid perPage={1} items={gallery} empty="No pinned looks from your friends, squad or House yet." render={(g) => (
              <div key={g.hero} className="look-gallery">
                <LookCard look={g} starter={g.starter} name={g.name} />
                <button className={`btn${g.liked ? ' primary' : ''}`} disabled={g.liked} onClick={() => like(g)}>{g.liked ? '❤ Liked' : '🤍 Like'} · {g.likes}</button>
              </div>
            )} />
          )}
          <p className="note" role="status">{note}</p>
        </>
      )}
    </main>
  );
}
