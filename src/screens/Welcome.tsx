export function Welcome({ demo, onNew, onSignIn, onAdult, onPrivacy }: { demo: boolean; onNew: () => void; onSignIn: () => void; onAdult: () => void; onPrivacy: () => void }) {
  return (
    <main className="screen welcome" style={{ backgroundImage: 'linear-gradient(180deg, rgba(11,10,36,.35), rgba(11,10,36,.92) 70%), url(/assets/backgrounds/hahn-entrance-tall.webp)' }}>
      <div className="grow" />
      <img className="logo" src="/assets/brand/emblem-hahn.webp" alt="" width={110} height={110} />
      <h1>H.A.H.N.</h1>
      <p className="tagline">Heroes Awakening: Hidden Nexus</p>
      <div className="stack">
        <button className="btn primary" onClick={onNew}>New Hero</button>
        <button className="btn ghost" onClick={onSignIn}>I Have a Hero</button>
        <div className="stack row">
          <button className="btn link" onClick={onAdult}>Parent, teacher or Sensei</button>
          <button className="btn link" onClick={onPrivacy}>Privacy and safety</button>
        </div>
      </div>
      {demo && <p className="note">Demo mode: your hero is saved on this device only.</p>}
    </main>
  );
}
