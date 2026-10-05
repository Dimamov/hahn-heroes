import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { ItemGrid } from '../components/ItemGrid.tsx';
import { HOUSE_COLORS, type NexlingState } from '../lib/backend.ts';
import { NexlingPlay } from './NexlingPlay.tsx';
import { NEXLING_TYPES, STAGE_NAMES, nexlingType, type NexlingType } from '../lib/nexlings.ts';

const SOURCE_LABEL: Record<string, string> = { learning: 'Learn practice', game: 'arcade games', class_mission: 'class missions', home_mission: 'home missions', streak: 'streaks', daily: 'the daily check-in', event: 'events' };
const SIZES = ['3.2rem', '4.6rem', '6.4rem', '8.4rem'];
const seenKey = (heroId: string) => `hahn-nexling-stage:${heroId}`;
const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : '';
  if (m.includes('letters')) return 'Names use 2 to 16 letters.';
  if (m.includes('different words')) return 'Please pick a different name.';
  return "That didn't work. Please try again.";
};

export function Nexlings() {
  const { backend, hero, go } = useSession();
  const [state, setState] = useState<NexlingState | null>(null);
  const [choosing, setChoosing] = useState<NexlingType | null>(null); // adopting or switching to this type
  const [editing, setEditing] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(HOUSE_COLORS[5]);
  const [error, setError] = useState('');
  const [evolved, setEvolved] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const load = useCallback(() => backend.nexlingState().then((s) => {
    setState(s);
    if (!s.mine) return;
    try {
      const seen = Number(localStorage.getItem(seenKey(hero.id)) ?? s.mine.stage);
      if (s.mine.stage > seen) setEvolved(s.mine.stage);
      localStorage.setItem(seenKey(hero.id), String(s.mine.stage));
    } catch { /* private window: no celebration memory */ }
  }).catch(() => setState({ stages: [0], mine: null })), [backend, hero.id]);
  useEffect(() => { load(); }, [load]);

  if (!state) return <main className="screen"><ScreenBar title="Nexlings" onBack={() => go('home')} /><div className="spinner" /></main>;
  const mine = state.mine;
  const mineType = mine && nexlingType(mine.type);

  const save = async (type: string) => {
    setError('');
    try { await backend.nexlingAdopt(type, name, color); setChoosing(null); setEditing(false); setSwitching(false); await load(); } catch (e) { setError(errText(e)); }
  };

  const form = (type: NexlingType, title: string, button: string) => (
    <main className="screen">
      <ScreenBar title={title} onBack={() => { setChoosing(null); setEditing(false); setError(''); }} />
      <div className="nex-preview" style={{ borderColor: color }}><span style={{ fontSize: SIZES[0] }}>{type.icon}</span><b>{type.name}</b></div>
      <label className="field plain"><span>Give it a name</span><input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder={type.name} /></label>
      <div className="chips" aria-label="Colour">
        {HOUSE_COLORS.map((c) => <button key={c} aria-label={c} className={`chip${color === c ? ' chosen' : ''}`} style={{ background: c, width: 36, height: 36, padding: 0 }} onClick={() => setColor(c)} />)}
      </div>
      <p className="error" role="alert">{error}</p>
      <div className="grow" />
      <button className="btn primary" disabled={name.trim().length < 2} onClick={() => save(type.id)}>{button}</button>
    </main>
  );

  if (choosing) return form(choosing, mine ? 'Switch Nexling' : 'Meet your Nexling', mine ? 'Switch (starts at zero)' : 'Adopt!');
  if (editing && mineType) return form(mineType, 'Customize', 'Save');

  if (!mine || switching) {
    return (
      <main className="screen">
        <ScreenBar title={mine ? 'Switch Nexling' : 'Choose a Nexling'} onBack={() => (mine ? setSwitching(false) : go('home'))} />
        <p className="note">{mine ? 'A new Nexling starts as a Hatchling. Your points are safe.' : 'Every Nexling is a great partner. Each grows extra from a different kind of play.'}</p>
        <ItemGrid perPage={4} items={NEXLING_TYPES} empty="" render={(t) => (
          <button key={t.id} className="item-tile nex" onClick={() => { setChoosing(t); setName(''); setColor(HOUSE_COLORS[5]); }}>
            <span className="item-icon">{t.icon}</span><b>{t.name}</b><small>Extra from {SOURCE_LABEL[t.bonus]}</small>
          </button>
        )} />
      </main>
    );
  }

  if (playing && mineType) return <NexlingPlay pet={{ icon: mineType.icon, name: mine.nickname, color: mine.color }} onBack={() => setPlaying(false)} />;
  const stage = mine.stage;
  const lo = state.stages[stage - 1] ?? 0;
  const pct = mine.nextAt ? Math.min(100, Math.round(((mine.growth - lo) / (mine.nextAt - lo)) * 100)) : 100;
  return (
    <main className="screen">
      <ScreenBar title="Nexlings" onBack={() => go('home')} />
      {evolved && <button className="evolve" onClick={() => setEvolved(null)}>🎉 {mine.nickname} grew into a {STAGE_NAMES[evolved - 1]}!</button>}
      <div className="nex-stage" style={{ borderColor: mine.color, boxShadow: `0 0 28px ${mine.color}66` }}>
        <span className={`nex-body s${stage}`} style={{ fontSize: SIZES[stage - 1] }} aria-label={`${mineType?.name}, ${STAGE_NAMES[stage - 1]}`}>{mineType?.icon}</span>
      </div>
      <b className="house-name" style={{ textAlign: 'center' }}>{mine.nickname}</b>
      <p className="muted" style={{ textAlign: 'center', margin: 0 }}>{mineType?.name} · Stage {stage}: {STAGE_NAMES[stage - 1]}</p>
      <div className="bar-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="bar-fill" style={{ width: `${pct}%`, background: mine.color }} /></div>
      <p className="note">{mine.nextAt ? `${mine.growth} / ${mine.nextAt} growth to the next stage` : `${mine.growth} growth. Fully grown!`}<br />Grows extra from {SOURCE_LABEL[mineType?.bonus ?? '']}.</p>
      <div className="grow" />
      <button className="btn ghost" onClick={() => setPlaying(true)}>🎮 Play with {mine.nickname}</button>
      <div className="seg">
        <button onClick={() => { setName(mine.nickname); setColor(mine.color); setEditing(true); }}>✏️ Customize</button>
        <button onClick={() => setSwitching(true)}>🔄 Switch</button>
      </div>
    </main>
  );
}
