import { useState, type ReactNode } from 'react';
import type { Adult, Backend } from '../../lib/backend.ts';
import { practiceBackend } from '../../lib/practice.ts';
import { ParentHome } from './ParentHome.tsx';
import { TeacherHome } from './TeacherHome.tsx';
import { SenseiHome } from './SenseiHome.tsx';

type Props = { backend: Backend; adult: Adult; onAdult: (a: Adult) => void; onSignOut: () => void; onPrivacy: () => void; renderPractice?: (backend: Backend, exit: () => void) => ReactNode };
type View = 'sensei' | 'parent' | 'student';
const VIEWS: { id: View; label: string }[] = [{ id: 'sensei', label: '🧙 Sensei' }, { id: 'parent', label: '👪 Parent' }, { id: 'student', label: '🎒 Student' }];

/** The Sensei can switch between the Sensei tools and practice Parent and Student views without signing out. */
function SenseiShell({ backend, adult, onSignOut, renderPractice }: Omit<Props, 'onAdult' | 'onPrivacy'>) {
  const [view, setView] = useState<View>('sensei');
  const [practice, setPractice] = useState<Backend | null>(null);
  const pick = (next: View) => {
    if (next === view) return;
    setPractice(null);
    setView(next);
    if (next !== 'sensei') practiceBackend(next).then(setPractice).catch(() => setView('sensei'));
  };
  return (
    <>
      <div className="sensei-shell">
        {view === 'sensei' || !renderPractice ? <SenseiHome backend={backend} adult={adult} onSignOut={onSignOut} />
          : practice ? renderPractice(practice, () => pick('sensei')) : <main className="screen center"><div className="spinner" aria-label="Loading" /></main>}
      </div>
      {renderPractice && (
        <nav className="view-switch" aria-label="Switch view">
          {VIEWS.map((v) => <button key={v.id} className={v.id === view ? 'on' : ''} aria-pressed={v.id === view} onClick={() => pick(v.id)}>{v.label}</button>)}
          {view !== 'sensei' && <small>Practice view: nothing here is real or saved.</small>}
        </nav>
      )}
    </>
  );
}

/** Grown-up tools live apart from student play. Each role gets its own home. */
export function AdultApp({ backend, adult, onAdult, onSignOut, onPrivacy, renderPractice }: Props) {
  const props = { backend, adult, onSignOut, onPrivacy };
  if (adult.role === 'parent') return <ParentHome {...props} />;
  if (adult.role === 'sensei') return <SenseiShell {...props} renderPractice={renderPractice} />;
  if (!adult.approved) {
    return (
      <main className="screen center">
        <div className="grow" />
        <div className="soon-icon" aria-hidden>⏳</div>
        <h3>Waiting for the Sensei</h3>
        <p className="hint">Thanks, {adult.displayName}! The Sensei needs to approve your teacher account before you can make a class.</p>
        <div className="grow" />
        <button className="btn primary" onClick={async () => { const r = await backend.restore(); if (r?.kind === 'adult') onAdult(r.adult); }}>Check again</button>
        <button className="btn ghost" onClick={onSignOut}>Sign out</button>
      </main>
    );
  }
  return <TeacherHome {...props} />;
}
