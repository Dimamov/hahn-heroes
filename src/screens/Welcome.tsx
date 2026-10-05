export function Welcome({ demo, onNew, onSignIn, onAdult }: { demo: boolean; onNew: () => void; onSignIn: () => void; onAdult: () => void }) {
  return (
    <main className="screen welcome" style={{ backgroundImage: 'linear-gradient(180deg, rgba(11,10,36,.35), rgba(11,10,36,.92) 70%), url(/assets/backgrounds/hahn-entrance-tall.webp)' }}>
      <div className="grow" />
      <img className="logo" src="/icon-192.png" alt="" width={96} height={96} />
      <h1>HAHN Heroes</h1>
      <p className="tagline">Heroes Awakening: Hidden Nexus</p>
      <div className="stack">
        <button className="btn primary" onClick={onNew}>New Hero</button>
        <button className="btn ghost" onClick={onSignIn}>I Have a Hero</button>
        <button className="btn link" onClick={onAdult}>Parent, teacher or Sensei</button>
      </div>
      {demo && <p className="note">Demo mode: your hero is saved on this device only.</p>}
    </main>
  );
}
