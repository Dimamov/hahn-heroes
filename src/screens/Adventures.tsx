import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../App.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import { Pager } from '../components/Pager.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { cardById } from '../lib/cards.ts';
import { EPISODES, episodeById, type StoryPanel, type StoryProgress } from '../lib/story.ts';
import { CardFace } from '../components/CardFace.tsx';

/** Adventures: the story episodes, plus the Mystery Lab and Chronicle Quest while they are being written. */
export function Adventures() {
  const { backend, go } = useSession();
  const [open, setOpen] = useState<string | null>(null);
  const [progress, setProgress] = useState<StoryProgress[] | null>(null);
  const load = useCallback(() => { backend.storyState().then(setProgress).catch(() => setProgress([])); }, [backend]);
  useEffect(load, [load]);

  if (open && progress) {
    const p = progress.find((x) => x.episode === open);
    if (p) return <Reader progress={p} onBack={() => { setOpen(null); load(); }} />;
  }
  return (
    <main className="screen">
      <ScreenBar title="Adventures" onBack={() => go('home')} />
      {progress === null ? <div className="spinner" /> : (
        <div className="adv-list">
          {EPISODES.map((e) => {
            const p = progress.find((x) => x.episode === e.id);
            return (
              <button key={e.id} className="card adv-card" onClick={() => setOpen(e.id)}>
                <span className="adv-icon" aria-hidden>📖</span>
                <span><b>{e.title}</b><small>{p?.completed ? '✅ Finished' : p && p.panel > 0 ? `Continue (page ${p.panel + 1} of ${e.panels.length})` : e.blurb}</small></span>
              </button>
            );
          })}
          <div className="card adv-card soon"><span className="adv-icon" aria-hidden>🔍</span><span><b>Mystery Lab</b><small>Cases to crack. Coming soon.</small></span></div>
          <div className="card adv-card soon"><span className="adv-icon" aria-hidden>🗺️</span><span><b>Chronicle Quest</b><small>Follow clues to the academy's secrets. Coming soon.</small></span></div>
        </div>
      )}
    </main>
  );
}

function Reader({ progress, onBack }: { progress: StoryProgress; onBack: () => void }) {
  const { backend, refresh } = useSession();
  const ep = episodeById(progress.episode)!;
  const [choices, setChoices] = useState(progress.choices);
  const [solved, setSolved] = useState(progress.solved);
  const [done, setDone] = useState(progress.completed);
  const best = useRef(progress.panel);
  const checkpoints = ep.panels.filter((p) => p.kind === 'quiz').length;

  const onPage = useCallback((i: number) => {
    if (i > best.current) { best.current = i; backend.storySave(ep.id, i).catch(() => undefined); }
  }, [backend, ep.id]);

  const pages = ep.panels.map((panel, i) => (
    <PanelView key={i} panel={panel} episode={ep.id} choices={choices} solved={solved}
      onChoice={(id, option) => setChoices((c) => ({ ...c, [id]: option }))}
      onSolved={(id) => { setSolved((s) => (s.includes(id) ? s : [...s, id])); refresh().catch(() => undefined); }}
      done={done} remaining={checkpoints - solved.length}
      onDone={() => { setDone(true); refresh().catch(() => undefined); }} />
  ));
  return (
    <main className="screen story">
      <ScreenBar title={ep.title} onBack={onBack} />
      <Pager pages={pages} start={Math.min(progress.panel, ep.panels.length - 1)} onPage={onPage} />
    </main>
  );
}

function Speaker({ panel }: { panel: Extract<StoryPanel, { kind: 'scene' }> }) {
  return (
    <>
      <div className="panel-art" aria-hidden>
        {panel.who ? panel.who.map((id) => <HeroArt key={id} id={id} className="panel-hero" />) : <span className="panel-emoji">{panel.art}</span>}
      </div>
      {panel.name && <b className="panel-name">{panel.name}</b>}
    </>
  );
}

function PanelView({ panel, episode, choices, solved, onChoice, onSolved, done, remaining, onDone }: {
  panel: StoryPanel; episode: string; choices: Record<string, string>; solved: string[];
  onChoice: (id: string, option: string) => void; onSolved: (id: string) => void; done: boolean; remaining: number; onDone: () => void;
}) {
  const { backend } = useSession();
  const [note, setNote] = useState('');
  const [wrong, setWrong] = useState<number | null>(null);
  const [explain, setExplain] = useState('');
  const [reward, setReward] = useState<{ card: string; coins?: number } | null>(null);

  if (panel.kind === 'scene') {
    return (
      <div className={`panel bg-${panel.bg}`}>
        <Speaker panel={panel} />
        <p className="panel-text">{panel.text}</p>
        <small className="swipe-hint">Swipe to keep reading</small>
      </div>
    );
  }
  if (panel.kind === 'choice') {
    const picked = choices[panel.id];
    const chosen = panel.options.find((o) => o.id === picked);
    const pick = async (id: string) => {
      try { const r = await backend.storyChoose(episode, panel.id, id); onChoice(panel.id, r.option); } catch { setNote("That didn't work. Try again."); }
    };
    return (
      <div className={`panel bg-${panel.bg}`}>
        <div className="panel-art" aria-hidden><span className="panel-emoji">{panel.art}</span></div>
        <p className="panel-text">{chosen ? chosen.after : panel.text}</p>
        {!chosen && <div className="panel-options">{panel.options.map((o) => <button key={o.id} className="btn" onClick={() => pick(o.id)}>{o.label}</button>)}</div>}
        {chosen && <small className="swipe-hint">Swipe to keep reading</small>}
        <p className="error" role="alert">{note}</p>
      </div>
    );
  }
  if (panel.kind === 'quiz') {
    const isSolved = solved.includes(panel.id);
    const answer = async (i: number) => {
      try {
        const r = await backend.storyAnswer(episode, panel.id, i);
        if (r.correct) { setExplain(r.explanation ?? ''); setWrong(null); onSolved(panel.id); } else setWrong(i);
      } catch { setNote("That didn't work. Try again."); }
    };
    return (
      <div className={`panel quiz bg-${panel.bg}`}>
        <div className="panel-art" aria-hidden><HeroArt id={panel.mentor} className="panel-hero" /></div>
        <p className="panel-tip">{panel.tip}</p>
        <p className="panel-text"><b>{panel.q}</b></p>
        <div className="panel-options">
          {panel.choices.map((c, i) => (
            <button key={c} className={`btn${wrong === i ? ' wrong' : ''}`} disabled={isSolved} onClick={() => answer(i)}>{c}</button>
          ))}
        </div>
        {wrong !== null && !isSolved && <small className="note">Not quite. Try another one!</small>}
        {isSolved && <small className="note" role="status">✅ {explain || 'Checkpoint cleared!'}</small>}
        <p className="error" role="alert">{note}</p>
      </div>
    );
  }
  const finish = async () => {
    try { const r = await backend.storyComplete(episode); setReward({ card: r.card, coins: r.coins }); onDone(); } catch { setNote('Clear every checkpoint first.'); }
  };
  const card = reward ? cardById(reward.card) : null;
  return (
    <div className={`panel bg-${panel.bg}`}>
      <div className="panel-art" aria-hidden><span className="panel-emoji">{panel.art}</span></div>
      <p className="panel-text">{panel.text}</p>
      {card && <CardFace id={card.id} />}
      {reward && <p className="note" role="status">You earned the {card?.name} card{reward.coins ? ` and ${reward.coins} points` : ''}! 🎉</p>}
      {!done && !reward && (remaining > 0
        ? <small className="note">Answer {remaining} more checkpoint{remaining === 1 ? '' : 's'} to finish. Swipe back to find them.</small>
        : <button className="btn primary" onClick={finish}>Finish the episode</button>)}
      {done && !reward && <small className="note">✅ Episode finished. Your card is in your collection.</small>}
      <p className="error" role="alert">{note}</p>
    </div>
  );
}
