import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../App.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import { Pager } from '../components/Pager.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { cardById } from '../lib/cards.ts';
import { CHRONICLE, LAB_CASES, type AdvProgress, type LabCase } from '../lib/adventures.ts';
import { EPISODES, episodeById, type StoryPanel, type StoryProgress } from '../lib/story.ts';
import { CardFace } from '../components/CardFace.tsx';
import { ReadAloud } from '../components/ReadAloud.tsx';
import { questionText } from '../lib/speak.ts';

/** Adventures: the story episodes, plus the Mystery Lab and Chronicle Quest while they are being written. */
export function Adventures() {
  const { backend, go } = useSession();
  const [open, setOpen] = useState<string | null>(null);
  const [progress, setProgress] = useState<StoryProgress[] | null>(null);
  const [adv, setAdv] = useState<AdvProgress[]>([]);
  const load = useCallback(() => {
    backend.storyState().then(setProgress).catch(() => setProgress([]));
    backend.advState().then(setAdv).catch(() => setAdv([]));
  }, [backend]);
  useEffect(load, [load]);
  const advOf = (id: string) => adv.find((a) => a.case === id);
  const back = () => { setOpen(null); load(); };

  if (open?.startsWith('lab:')) {
    const c = LAB_CASES.find((x) => x.id === open.slice(4));
    if (c) return <LabCaseView c={c} progress={advOf(c.id)} onBack={back} />;
  }
  if (open === 'chronicle') return <ChronicleView progress={advOf(CHRONICLE.id)} onBack={back} />;
  if (open && progress) {
    const p = progress.find((x) => x.episode === open);
    if (p) return <Reader progress={p} onBack={back} />;
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
          {LAB_CASES.map((c) => (
            <button key={c.id} className="card adv-card" onClick={() => setOpen(`lab:${c.id}`)}>
              <span className="adv-icon" aria-hidden>{c.icon}</span>
              <span><b>Mystery Lab: {c.title}</b><small>{advOf(c.id)?.done ? '✅ Case solved' : `${advOf(c.id)?.solved.length ?? 0} of ${c.steps.length} answers found`}</small></span>
            </button>
          ))}
          <button className="card adv-card" onClick={() => setOpen('chronicle')}>
            <span className="adv-icon" aria-hidden>{CHRONICLE.icon}</span>
            <span><b>Chronicle Quest: {CHRONICLE.title}</b><small>{advOf(CHRONICLE.id)?.done ? '✅ Trail finished' : `${advOf(CHRONICLE.id)?.solved.length ?? 0} of ${CHRONICLE.steps.length} clues unlocked`}</small></span>
          </button>
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
  const [cur, setCur] = useState(Math.min(progress.panel, ep.panels.length - 1));
  const checkpoints = ep.panels.filter((p) => p.kind === 'quiz').length;

  const onPage = useCallback((i: number) => {
    setCur(i);
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
      <ScreenBar title={ep.title} onBack={onBack} right={<ReadAloud text={panelText(ep.panels[cur])} />} />
      <Pager pages={pages} start={Math.min(progress.panel, ep.panels.length - 1)} onPage={onPage} />
    </main>
  );
}

/** What a story panel sounds like when read out. */
function panelText(panel: StoryPanel): string {
  if (panel.kind === 'quiz') return `${panel.tip} ${questionText(panel.q, panel.choices)}`;
  const spoken = 'name' in panel && panel.name ? `${panel.name} says: ` : '';
  return spoken + panel.text;
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

/** One multiple-choice question that the server checks. Shows the explanation once it is right. */
function AdvQuestion({ caseId, step, q, choices, solved, onSolved }: {
  caseId: string; step: string; q: string; choices: string[]; solved: boolean; onSolved: (step: string) => void;
}) {
  const { backend, refresh } = useSession();
  const [wrong, setWrong] = useState<number | null>(null);
  const [explain, setExplain] = useState('');
  const [note, setNote] = useState('');
  const answer = async (i: number) => {
    try {
      const r = await backend.advAnswer(caseId, step, i);
      if (r.correct) { setExplain(r.explanation ?? ''); setWrong(null); onSolved(step); refresh().catch(() => undefined); } else setWrong(i);
    } catch { setNote("That didn't work. Try again."); }
  };
  return (
    <>
      <p className="panel-text"><b>{q}</b></p>
      <div className="panel-options">
        {choices.map((c, i) => <button key={c} className={`btn${wrong === i ? ' wrong' : ''}`} disabled={solved} onClick={() => answer(i)}>{c}</button>)}
      </div>
      {wrong !== null && !solved && <small className="note">Not quite. Look at the clues again!</small>}
      {solved && <small className="note" role="status">✅ {explain || 'Solved!'}</small>}
      <p className="error" role="alert">{note}</p>
    </>
  );
}

function Prize({ caseId, ready, done, onDone, label }: { caseId: string; ready: boolean; done: boolean; onDone: () => void; label: string }) {
  const { backend, refresh } = useSession();
  const [reward, setReward] = useState<{ card: string; coins?: number } | null>(null);
  const [note, setNote] = useState('');
  const finish = async () => {
    try { const r = await backend.advComplete(caseId); setReward({ card: r.card, coins: r.coins }); onDone(); refresh().catch(() => undefined); } catch { setNote('Answer every question first.'); }
  };
  const card = reward ? cardById(reward.card) : null;
  return (
    <>
      {card && <CardFace id={card.id} />}
      {reward && <p className="note" role="status">You earned the {card?.name} card{reward.coins ? ` and ${reward.coins} points` : ''}! 🎉</p>}
      {!done && !reward && (ready ? <button className="btn primary" onClick={finish}>{label}</button> : <small className="note">Answer every question to finish.</small>)}
      {done && !reward && <small className="note">✅ Finished. Your card is in your collection.</small>}
      <p className="error" role="alert">{note}</p>
    </>
  );
}

function LabCaseView({ c, progress, onBack }: { c: LabCase; progress?: AdvProgress; onBack: () => void }) {
  const [solved, setSolved] = useState(progress?.solved ?? []);
  const [done, setDone] = useState(progress?.done ?? false);
  const [seen, setSeen] = useState<number[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const pages = [
    <div className="panel bg-hall" key="intro"><span className="panel-emoji" aria-hidden>{c.icon}</span><p className="panel-text">{c.intro}</p><small className="swipe-hint">Swipe to inspect the clues</small></div>,
    <div className="panel bg-portal" key="clues">
      <p className="panel-text"><b>Tap a clue to inspect it</b></p>
      <div className="clue-grid">
        {c.clues.map((cl, i) => (
          <button key={cl.name} className={`btn clue${seen.includes(i) ? ' seen' : ''}`} onClick={() => { setOpen(i); setSeen((x) => (x.includes(i) ? x : [...x, i])); }}>{cl.icon} {cl.name}</button>
        ))}
      </div>
      <p className="panel-text clue-text" role="status">{open !== null ? c.clues[open].text : 'Inspect every clue, then swipe to answer.'}</p>
    </div>,
    ...c.steps.map((st) => (
      <div className="panel quiz bg-keeper" key={st.id}>
        <div className="panel-art" aria-hidden><span className="panel-emoji">🔍</span></div>
        <small className="muted">{c.clues.map((cl) => cl.icon).join(' ')}</small>
        <AdvQuestion caseId={c.id} step={st.id} q={st.q} choices={st.choices} solved={solved.includes(st.id)}
          onSolved={(id) => setSolved((x) => (x.includes(id) ? x : [...x, id]))} />
      </div>
    )),
    <div className="panel bg-dusk" key="verdict">
      <span className="panel-emoji" aria-hidden>🕵️</span>
      <p className="panel-text">{done ? 'Case closed. Great detective work!' : 'Ready to close the case?'}</p>
      <Prize caseId={c.id} ready={solved.length === c.steps.length} done={done} onDone={() => setDone(true)} label="Close the case" />
    </div>,
  ];
  return (
    <main className="screen story">
      <ScreenBar title={c.title} onBack={onBack} />
      <Pager pages={pages} />
    </main>
  );
}

function ChronicleView({ progress, onBack }: { progress?: AdvProgress; onBack: () => void }) {
  const [solved, setSolved] = useState(progress?.solved ?? []);
  const [done, setDone] = useState(progress?.done ?? false);
  const steps = CHRONICLE.steps;
  const pages = [
    <div className="panel bg-hall" key="intro"><span className="panel-emoji" aria-hidden>{CHRONICLE.icon}</span><p className="panel-text">{CHRONICLE.intro}</p><small className="swipe-hint">Swipe to begin the trail</small></div>,
    ...steps.map((st, i) => {
      const open = i === 0 || solved.includes(steps[i - 1].id);
      return open ? (
        <div className="panel quiz bg-keeper" key={st.id}>
          <small className="muted">Clue {i + 1} of {steps.length}</small>
          <p className="panel-text">{st.lore}</p>
          <AdvQuestion caseId={CHRONICLE.id} step={st.id} q={st.q} choices={st.choices} solved={solved.includes(st.id)}
            onSolved={(id) => setSolved((x) => (x.includes(id) ? x : [...x, id]))} />
        </div>
      ) : (
        <div className="panel bg-dusk" key={st.id}><span className="panel-emoji" aria-hidden>🔒</span><p className="panel-text">This clue is sealed. Solve the one before it to open it.</p></div>
      );
    }),
    <div className="panel bg-portal" key="end">
      <span className="panel-emoji" aria-hidden>📜</span>
      <p className="panel-text">{done ? 'You uncovered the whole Chronicle!' : 'The Chronicle is almost complete.'}</p>
      <Prize caseId={CHRONICLE.id} ready={solved.length === steps.length} done={done} onDone={() => setDone(true)} label="Claim the Chronicle" />
    </div>,
  ];
  return (
    <main className="screen story">
      <ScreenBar title="Chronicle Quest" onBack={onBack} />
      <Pager pages={pages} />
    </main>
  );
}
