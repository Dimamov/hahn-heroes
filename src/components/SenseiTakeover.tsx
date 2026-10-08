import { useCallback, useEffect, useRef, useState } from 'react';
import type { Backend } from '../lib/backend.ts';
import { siren } from '../lib/sound.ts';

interface Msg { key: string; title: string; text: string; reward: number; kind: 'announce' | 'reply' }

/**
 * Full-screen Sensei moment: new announcements and the Sensei's replies and rewards slide in one at a time.
 * Tap anywhere (or press a key) to continue. Held back while a game or quiz is running, never blocks sign-in.
 */
export function SenseiTakeover({ backend, heroId, paused, onDone }: { backend: Backend; heroId: string; paused: boolean; onDone: () => void }) {
  const [queue, setQueue] = useState<Msg[]>([]);
  const busy = useRef(false);
  const shown = useRef(0);

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const [a, mine] = await Promise.all([backend.announcements(), backend.senseiMyMessages().catch(() => [])]);
      const msgs: Msg[] = [
        ...a.items.slice(0, a.unread).reverse().map((x): Msg => ({ key: `a${x.id}`, title: x.title, text: x.body, reward: 0, kind: 'announce' })),
        ...mine.filter((m) => m.unseen).reverse().map((m): Msg => ({
          key: `m${m.id}:${m.reward}`, title: m.reward > 0 ? 'A reward from the Sensei!' : 'The Sensei answered!',
          text: m.reply || 'Thank you for helping the Nexus, hero!', reward: m.reward, kind: 'reply',
        })),
      ];
      if (msgs.length) setQueue(msgs);
    } catch { /* offline or signed out: try again later */ }
    busy.current = false;
  }, [backend]);

  useEffect(() => { if (!paused && queue.length === 0) check(); }, [paused, heroId, check]); // eslint-disable-line react-hooks/exhaustive-deps
  // New messages from the Sensei take over the screen soon after they are sent, not only when the app opens.
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === 'visible' && !paused && shown.current === 0) check(); }, 30000);
    return () => window.clearInterval(id);
  }, [check, paused]);
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible' && !paused) check(); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [check, paused]);

  const next = async () => {
    const rest = queue.slice(1);
    setQueue(rest);
    if (rest.length === 0) {
      await backend.markAnnouncementsRead().catch(() => undefined);
      await backend.senseiRepliesSeen().catch(() => undefined);
      onDone();
    }
  };
  shown.current = queue.length;
  const m = queue[0];
  useEffect(() => {
    if (!m) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); next(); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  // A brief siren when a Sensei message arrives (silent in quiet mode, and phones may hold sound until the first tap).
  const arrivedKey = m && !paused ? m.key : null;
  useEffect(() => { if (arrivedKey) siren(1.5); }, [arrivedKey]);
  if (!m || paused) return null;

  return (
    <div className="takeover" role="dialog" aria-modal="true" aria-label={m.title} onClick={next}>
      <div className="to-bg" />
      <div className="to-rings" aria-hidden><i /><i /><i /></div>
      <div className="to-sparks" aria-hidden>{Array.from({ length: 14 }, (_, i) => <b key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.35}s` }} />)}</div>
      <img className="to-fx" src="/assets/sensei/fx-nexus-burst.webp" alt="" aria-hidden onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      <img className="to-sensei" src="/assets/sensei/sensei-announce.webp" alt="" aria-hidden />
      <div className="to-panel">
        <small>{m.kind === 'announce' ? 'MESSAGE FROM THE SENSEI' : 'THE SENSEI SAYS'}</small>
        <h2>{m.title}</h2>
        <p>{m.text}</p>
        {m.reward > 0 && <div className="to-reward">💎 +{m.reward}</div>}
        <span className="to-tap">{queue.length > 1 ? `Tap for the next one (${queue.length - 1} more)` : 'Tap to continue'}</span>
      </div>
    </div>
  );
}
