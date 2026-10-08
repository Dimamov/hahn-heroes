import { useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import './install-prompt.css';

const seenKey = (heroId: string) => `hahn-parent-prompt-seen:${heroId}`;

/** First login: a friendly window asking the hero to link a parent. Shown once per hero, only while no parent is linked. */
export function ParentLinkPrompt() {
  const { backend, hero, go, classroom } = useSession();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem(seenKey(hero.id))) return; } catch { /* blocked storage: show it once per visit */ }
    let stop = false;
    backend.parentCount().then((n) => { if (!stop && n === 0) setOpen(true); }).catch(() => undefined);
    return () => { stop = true; };
  }, [backend, hero.id]);
  const close = () => {
    try { localStorage.setItem(seenKey(hero.id), '1'); } catch { /* blocked storage */ }
    setOpen(false);
  };
  if (!open || classroom) return null;
  return (
    <div className="install-pop" role="dialog" aria-modal="true" aria-label="Link your parent">
      <div className="install-card">
        <div className="install-icon" aria-hidden>👪</div>
        <h2>Link your parent</h2>
        <p className="install-lead">With a parent account they can see how your week is going, give you home chores and approve them. Ask a grown-up to help you get your code.</p>
        <button className="btn primary" onClick={() => { close(); go('parentcode'); }}>Get my parent code</button>
        <button className="btn ghost" onClick={close}>Maybe later</button>
      </div>
    </div>
  );
}
