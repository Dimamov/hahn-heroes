import type { Adult, Backend } from '../../lib/backend.ts';
import { ParentHome } from './ParentHome.tsx';
import { TeacherHome } from './TeacherHome.tsx';
import { SenseiHome } from './SenseiHome.tsx';

/** Grown-up tools live apart from student play. Each role gets its own home. */
export function AdultApp({ backend, adult, onAdult, onSignOut, onPrivacy }: { backend: Backend; adult: Adult; onAdult: (a: Adult) => void; onSignOut: () => void; onPrivacy: () => void }) {
  const props = { backend, adult, onSignOut, onPrivacy };
  if (adult.role === 'parent') return <ParentHome {...props} />;
  if (adult.role === 'sensei') return <SenseiHome {...props} />;
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
