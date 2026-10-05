import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { Pager } from '../components/Pager.tsx';
import { ItemGrid } from '../components/ItemGrid.tsx';
import { ComicPanel, ComicStrip } from '../components/ComicPanel.tsx';
import { HEROES } from '../lib/heroes.ts';
import { COMIC_LINES, COMIC_MAX, COMIC_POSES, COMIC_SCENES, blankPanel, type Comic, type ComicPanelData, type ComicPanels } from '../lib/comics.ts';

/** Build a three-panel comic from fixed choices and share it with your squad. */
export function Comics() {
  const { backend, hero, go } = useSession();
  const [tab, setTab] = useState<'mine' | 'squad'>('mine');
  const [mine, setMine] = useState<Comic[] | null>(null);
  const [squad, setSquad] = useState<Comic[] | null>(null);
  const [making, setMaking] = useState(false);
  const [panels, setPanels] = useState<ComicPanels>(() => [blankPanel(hero.starter), blankPanel(hero.starter), blankPanel(hero.starter)]);
  const [at, setAt] = useState(0);
  const [note, setNote] = useState('');
  const load = useCallback(() => {
    backend.comicList().then(setMine).catch(() => setMine([]));
    backend.comicSquad().then(setSquad).catch(() => setSquad([]));
  }, [backend]);
  useEffect(load, [load]);

  const set = <K extends keyof ComicPanelData>(k: K, v: ComicPanelData[K]) => setPanels(panels.map((p, i) => (i === at ? { ...p, [k]: v } : p)) as ComicPanels);
  const save = async () => {
    try { await backend.comicMake(panels); setNote('Comic saved! ✨'); setMaking(false); load(); } catch { setNote('Your comic shelf is full. Delete one first.'); }
  };
  const share = async (c: Comic) => {
    try { await backend.comicShare(c.id, !c.shared); setNote(c.shared ? 'Not shared any more.' : 'Shared with your squad! 💬'); load(); } catch { setNote('Join a squad to share comics.'); }
  };
  const del = async (c: Comic) => { try { await backend.comicDelete(c.id); load(); } catch { setNote("That didn't work."); } };

  if (making) {
    const p = panels[at];
    const page = (title: string, body: React.ReactNode) => <div className="list-page" key={title}><h3 className="page-title">{title}</h3>{body}</div>;
    return (
      <main className="screen comic-make">
        <ScreenBar title={`Panel ${at + 1} of 3`} onBack={() => setMaking(false)} />
        <ComicPanel p={p} />
        <div className="paged">
          <Pager key={at} pages={[
            page('Hero 1/2', <div className="chips">{HEROES.slice(0, 10).map((h) => <button key={h.id} className={`chip${p.hero === h.id ? ' chosen' : ''}`} onClick={() => set('hero', h.id)}>{h.label}</button>)}</div>),
            page('Hero 2/2', <div className="chips">{HEROES.slice(10).map((h) => <button key={h.id} className={`chip${p.hero === h.id ? ' chosen' : ''}`} onClick={() => set('hero', h.id)}>{h.label}</button>)}</div>),
            page('Scene and pose', <>
              <div className="chips">{COMIC_SCENES.map((s) => <button key={s.id} className={`chip${p.scene === s.id ? ' chosen' : ''}`} onClick={() => set('scene', s.id)}>{s.label}</button>)}</div>
              <div className="chips">{COMIC_POSES.map((x) => <button key={x} className={`chip${p.pose === x ? ' chosen' : ''}`} onClick={() => set('pose', x)}>{x}</button>)}</div>
            </>),
            page('Words 1/2', <div className="chips">{COMIC_LINES.slice(0, 8).map((w) => <button key={w} className={`chip${p.line === w ? ' chosen' : ''}`} onClick={() => set('line', w)}>{w}</button>)}</div>),
            page('Words 2/2', <div className="chips">{COMIC_LINES.slice(8).map((w) => <button key={w} className={`chip${p.line === w ? ' chosen' : ''}`} onClick={() => set('line', w)}>{w}</button>)}</div>),
          ]} />
        </div>
        <p className="note" role="status">{note}</p>
        <div className="btn-grid">
          {at > 0 && <button className="btn" onClick={() => setAt(at - 1)}>◀ Panel {at}</button>}
          {at < 2 ? <button className="btn primary" onClick={() => setAt(at + 1)}>Panel {at + 2} ▶</button> : <button className="btn primary" onClick={save}>Save comic</button>}
        </div>
      </main>
    );
  }
  const list = tab === 'mine' ? mine : squad;
  return (
    <main className="screen">
      <ScreenBar title="Comics" onBack={() => go('home')} />
      <div className="chips"><button className={`chip${tab === 'mine' ? ' chosen' : ''}`} onClick={() => setTab('mine')}>My comics</button><button className={`chip${tab === 'squad' ? ' chosen' : ''}`} onClick={() => setTab('squad')}>Squad comics</button></div>
      {!list ? <div className="spinner" /> : (
        <ItemGrid perPage={1} items={list} empty={tab === 'mine' ? 'No comics yet. Make your first one!' : 'Nothing shared by your squad yet.'} render={(c) => (
          <div key={c.id} className="comic-card">
            <ComicStrip panels={c.panels} />
            {tab === 'mine'
              ? <div className="btn-grid"><button className="btn" onClick={() => share(c)}>{c.shared ? '✓ Shared' : 'Share with squad'}</button><button className="btn" onClick={() => del(c)}>Delete</button></div>
              : <p className="hint">By {c.maker}</p>}
          </div>
        )} />
      )}
      <p className="note" role="status">{note || (mine ? `${mine.length}/${COMIC_MAX} comics on your shelf.` : '')}</p>
      <button className="btn primary" onClick={() => { setNote(''); setAt(0); setPanels([blankPanel(hero.starter), blankPanel(hero.starter), blankPanel(hero.starter)]); setMaking(true); }}>＋ Make a comic</button>
    </main>
  );
}
