import { useState } from 'react';
import { useSession } from '../App.tsx';
import { currentKind } from './InstallPrompt.tsx';
import './install-prompt.css';

const seenKey = (heroId: string) => `hahn-tutorial-seen:${heroId}`;

interface Slide { icon: React.ReactNode; title: string; text: string; steps?: string[] }

const BASE: Slide[] = [
  { icon: '🦸', title: 'Welcome, hero!', text: 'HAHN Heroes is where learning feels like an adventure. Here is a quick tour. It takes under a minute.' },
  { icon: '🧠', title: 'Learn to earn', text: 'Practice Math, Words and Reading in Learn. Every right answer earns points you can spend in the shop and on your Nexling.' },
  { icon: '🎮', title: 'Play and explore', text: 'The Arcade has games to play alone or with your squad. Open Episodes for story adventures, and Missions for home and class tasks.' },
  { icon: <i className="red-dot tut-dot" aria-hidden />, title: 'Red dots mean rewards!', text: 'A red dot means you have a reward waiting for today. Tap it to collect before the day ends. Some rewards come back every day.' },
  { icon: '🧙', title: 'The Sensei is here to help', text: 'Tap The Sensei on the home screen to ask for help or share an idea. The Sensei will pop up on your screen with news.' },
];
const DESKTOP_INSTALL: Slide = {
  icon: '📲', title: 'Make it an app',
  text: 'Put HAHN Heroes on your device so it opens like a real app.',
  steps: ['Chrome or Edge: click the install icon in the address bar, or open the ⋮ menu and choose Install.', 'Safari on a Mac: choose File, then Add to Dock.', 'Ask a grown-up if you need help.'],
};

/** First login: a short tour of the app. Shown once per hero. */
export function Tutorial() {
  const { hero, classroom } = useSession();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(() => {
    try { return !localStorage.getItem(seenKey(hero.id)); } catch { return true; }
  });
  const slides = currentKind() === null ? [...BASE, DESKTOP_INSTALL] : BASE;
  const close = () => {
    try { localStorage.setItem(seenKey(hero.id), '1'); } catch { /* blocked storage */ }
    setOpen(false);
  };
  if (!open || classroom) return null;
  const s = slides[step];
  const last = step === slides.length - 1;
  return (
    <div className="install-pop" role="dialog" aria-modal="true" aria-label="How HAHN Heroes works">
      <div className="install-card">
        <div className="install-icon tut-icon" aria-hidden>{s.icon}</div>
        <h2>{s.title}</h2>
        <p className="install-lead">{s.text}</p>
        {s.steps && <ol className="install-steps">{s.steps.map((t) => <li key={t}>{t}</li>)}</ol>}
        <p className="note" aria-hidden>{slides.map((_, i) => (i === step ? '●' : '○')).join(' ')}</p>
        <button className="btn primary" onClick={() => (last ? close() : setStep(step + 1))}>{last ? "Let's go!" : 'Next'}</button>
        {!last && <button className="btn ghost" onClick={close}>Skip</button>}
      </div>
    </div>
  );
}
