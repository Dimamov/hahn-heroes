import { useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';

/** Every game shares this frame: a clear way out, and one place that collects the daily reward. */
export function GameFrame({ title, hint, onExit, children }: { title: string; hint?: string; onExit?: () => void; children: React.ReactNode }) {
  const { go } = useSession();
  return (
    <main className="screen game">
      <ScreenBar title={title} onBack={onExit ?? (() => go('arcade'))} />
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
      <div className="soon-icon" aria-hidden>🎉</div>
      <h3>{message}</h3>
      {line && <p className="hint">{line}</p>}
      {(result === null || result === 'error') && <button className="btn primary" disabled={busy} onClick={collect}>🎁 Collect today's reward</button>}
      <button className="btn" onClick={onAgain}>Play again</button>
      <button className="btn ghost" onClick={() => go('arcade')}>Back to the Arcade</button>
    </div>
  );
}
