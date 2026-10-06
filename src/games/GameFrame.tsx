import { useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { ThumbButton } from '../components/ThumbButton.tsx';
import { confetti } from '../lib/fx.ts';

/** Every game shares this frame: a clear way out, and one place that collects the daily reward. */
export function GameFrame({ title, hint, onExit, right, children }: { title: string; hint?: string; onExit?: () => void; right?: React.ReactNode; children: React.ReactNode }) {
  const { go } = useSession();
  return (
    <main className="screen game">
      <ScreenBar title={title} onBack={onExit ?? (() => go('arcade'))} right={<>{right}<ThumbButton /></>} />
      {hint && <p className="hint">{hint}</p>}
      {children}
    </main>
  );
}

/** Shown when a game is won. Collects the daily reward once and says what happened. */
export function WinPanel({ game, message, onAgain }: { game: string; message: string; onAgain: () => void }) {
  const { backend, refresh, go } = useSession();
  const [result, setResult] = useState<{ awarded: number; duplicate: boolean; capped: boolean } | 'error' | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { confetti(); }, []);
  const collect = async () => {
    setBusy(true);
    try { setResult(await backend.arcadeClaim(game)); await refresh(); } catch { setResult('error'); }
    setBusy(false);
  };
  const line =
    result === null ? null
    : result === 'error' ? "Couldn't collect that. Try again."
    : result.duplicate ? 'You already collected this game today. Play for fun!'
    : result.awarded === 0 ? 'The weekly arcade limit is full. Learn to earn more!'
    : `+${result.awarded} 💎 Nexus points and some XP!`;
  return (
    <div className="win" role="status">
      <div className="soon-icon win-burst" aria-hidden>🎉</div>
      <h3>{message}</h3>
      {line && <p className="hint">{line}</p>}
      {(result === null || result === 'error') && <button className="btn primary" disabled={busy} onClick={collect}>🎁 Collect today's reward</button>}
      <button className="btn" onClick={onAgain}>Play again</button>
      <button className="btn ghost" onClick={() => go('arcade')}>Back to the Arcade</button>
    </div>
  );
}

/** A big glowing character for a lobby or intro screen, so it is not a blank page. */
export function GameHero({ icon, art, tall }: { icon: string; art?: string; tall?: boolean }) {
  return <div className={`game-hero${art ? ' art' : ''}${tall ? ' tall' : ''}`} aria-hidden>{art ? <img src={`/assets/games/${art}.webp`} alt="" draggable={false} /> : <span>{icon}</span>}</div>;
}
