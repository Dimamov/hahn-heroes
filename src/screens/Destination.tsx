import { useSession } from '../App.tsx';
import { DESTINATIONS } from '../lib/destinations.ts';

/** Placeholder for destinations whose milestone isn't built yet. Always has a way back home. */
export function Destination({ id }: { id: string }) {
  const { go } = useSession();
  const d = DESTINATIONS.find((x) => x.id === id);
  return (
    <main className="screen center">
      <header className="bar"><button className="back" onClick={() => go('home')} aria-label="Back to the Nexus">←</button><h2>{d?.label ?? 'Nexus'}</h2></header>
      <div className="grow" />
      <div className="soon-icon" aria-hidden>{d?.icon ?? '✨'}</div>
      <h3>Coming soon</h3>
      <p className="hint">{d?.blurb ?? 'This part of the Nexus is still sealed.'}</p>
      {d && <p className="note">Arrives with: {d.milestone}</p>}
      <div className="grow" />
      <button className="btn primary" onClick={() => go('home')}>Back to the Nexus</button>
    </main>
  );
}
