import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { Pager } from '../components/Pager.tsx';
import { ItemGrid } from '../components/ItemGrid.tsx';
import { StickerFace } from '../components/StickerFace.tsx';
import { HEROES } from '../lib/heroes.ts';
import { STICKER_BGS, STICKER_COST, STICKER_DAILY, STICKER_DECOS, STICKER_FRAMES, STICKER_WORDS, bgColor, type Sticker, type StickerBook, type StickerDesign } from '../lib/stickers.ts';
import type { SquadMember } from '../lib/backend.ts';

const REASONS: Record<string, string> = { daily_limit: `You can make ${STICKER_DAILY} stickers a day. Come back tomorrow!`, full: 'That sticker book is full.' };

/** Make stickers from hero art and give them to your squad. */
export function Stickers() {
  const { backend, hero, go, refresh } = useSession();
  const [book, setBook] = useState<StickerBook | null>(null);
  const [making, setMaking] = useState(false);
  const [design, setDesign] = useState<StickerDesign>({ hero: hero.starter, bg: 'violet', frame: 'star', deco: '⭐', word: 'Hero!' });
  const [giving, setGiving] = useState<Sticker | null>(null);
  const [mates, setMates] = useState<SquadMember[]>([]);
  const [note, setNote] = useState('');
  const load = useCallback(() => { backend.stickerList().then(setBook).catch(() => setBook({ stickers: [], madeToday: 0 })); }, [backend]);
  useEffect(load, [load]);
  useEffect(() => { if (giving) backend.mySquad().then((s) => setMates((s.squad?.members ?? []).filter((m) => m.status === 'member' && m.heroId !== hero.id))).catch(() => setMates([])); }, [giving, backend, hero.id]);

  const make = async () => {
    try {
      const r = await backend.stickerMake(design);
      if (r.ok) { setNote('Sticker made! ✨'); setMaking(false); refresh().catch(() => undefined); } else setNote(REASONS[r.reason ?? ''] ?? "That didn't work.");
      load();
    } catch { setNote(`You need ${STICKER_COST} 💎 to make a sticker.`); }
  };
  const give = async (m: SquadMember) => {
    if (!giving) return;
    try { const r = await backend.stickerGive(giving.id, m.heroId); setNote(r.ok ? `Sent to ${m.name}! 🎁` : REASONS[r.reason ?? ''] ?? "That didn't work."); setGiving(null); load(); }
    catch { setNote("That didn't work."); }
  };

  if (giving) {
    return (
      <main className="screen">
        <ScreenBar title="Give a sticker" onBack={() => setGiving(null)} />
        <StickerFace s={giving} />
        <p className="hint">Pick a squad mate:</p>
        <ItemGrid perPage={4} items={mates} empty="Join a squad to give stickers to your friends." render={(m) => <button key={m.heroId} className="card clickable" onClick={() => give(m)}><b>🎁 {m.name}</b></button>} />
      </main>
    );
  }
  if (making) {
    const set = <K extends keyof StickerDesign>(k: K, v: StickerDesign[K]) => setDesign({ ...design, [k]: v });
    const page = (title: string, body: React.ReactNode) => <div className="list-page" key={title}><h3 className="page-title">{title}</h3>{body}</div>;
    return (
      <main className="screen sticker-make">
        <ScreenBar title="Make a sticker" onBack={() => setMaking(false)} />
        <StickerFace s={design} />
        <div className="paged">
          <Pager pages={[
            page('Hero 1/2', <div className="chips">{HEROES.slice(0, 10).map((h) => <button key={h.id} className={`chip${design.hero === h.id ? ' chosen' : ''}`} onClick={() => set('hero', h.id)}>{h.label}</button>)}</div>),
            page('Hero 2/2', <div className="chips">{HEROES.slice(10).map((h) => <button key={h.id} className={`chip${design.hero === h.id ? ' chosen' : ''}`} onClick={() => set('hero', h.id)}>{h.label}</button>)}</div>),
            page('Colour and frame', <>
              <div className="chips">{STICKER_BGS.map((b) => <button key={b.id} aria-label={b.id} className={`chip${design.bg === b.id ? ' chosen' : ''}`} style={{ background: bgColor(b.id), width: 38, height: 38, padding: 0 }} onClick={() => set('bg', b.id)} />)}</div>
              <div className="chips">{STICKER_FRAMES.map((f) => <button key={f} className={`chip${design.frame === f ? ' chosen' : ''}`} onClick={() => set('frame', f)}>{f}</button>)}</div>
            </>),
            page('Decoration', <div className="chips">{STICKER_DECOS.map((d) => <button key={d} className={`chip${design.deco === d ? ' chosen' : ''}`} onClick={() => set('deco', d)}>{d}</button>)}</div>),
            page('Word', <div className="chips">{STICKER_WORDS.map((w) => <button key={w} className={`chip${design.word === w ? ' chosen' : ''}`} onClick={() => set('word', w)}>{w}</button>)}</div>),
          ]} />
        </div>
        <p className="note" role="status">{note}</p>
        <button className="btn primary" onClick={make}>Make it ({STICKER_COST} 💎)</button>
      </main>
    );
  }
  return (
    <main className="screen">
      <ScreenBar title="Stickers" onBack={() => go('home')} />
      <p className="hint">Make stickers from hero art and give them to your squad.</p>
      {!book ? <div className="spinner" /> : (
        <ItemGrid perPage={6} items={book.stickers} empty="No stickers yet. Make your first one!" render={(s) => <StickerFace key={s.id} s={s} small onClick={() => { setNote(''); setGiving(s); }} />} />
      )}
      <p className="note" role="status">{note || (book ? `Tap a sticker to give it away. ${book.madeToday}/${STICKER_DAILY} made today.` : '')}</p>
      <button className="btn primary" onClick={() => { setNote(''); setMaking(true); }}>＋ Make a sticker</button>
    </main>
  );
}
