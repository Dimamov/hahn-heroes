import { useEffect, useRef, useState } from 'react';
import { GameFrame } from './GameFrame.tsx';
import { useSession } from '../App.tsx';
import { siren } from '../lib/sound.ts';

interface YTPlayer { playVideo(): void; stop(): void; mute(): void; unMute(): void; isMuted(): boolean; getPlayerState(): number; destroy(): void }
interface YTApi { Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer }
const VIDEO = 'dQw4w9WgXcQ';

let apiLoad: Promise<YTApi> | null = null;
/** Loads the YouTube player script once. */
function youtube(): Promise<YTApi> {
  const w = window as unknown as { YT?: YTApi; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  apiLoad ??= new Promise<YTApi>((resolve, reject) => {
    w.onYouTubeIframeAPIReady = () => resolve(w.YT!);
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = () => { apiLoad = null; reject(new Error('no player')); };
    document.head.appendChild(tag);
  });
  return apiLoad;
}

/** The warning button. The siren can never stack: taps are ignored while it is sounding. */
export function DoNotPress() {
  const [phase, setPhase] = useState<'idle' | 'siren' | 'video'>('idle');
  const { go } = useSession();
  const busy = useRef(false);
  const timer = useRef<number>(0);
  const mount = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [needTap, setNeedTap] = useState(false);
  // The player is built as soon as the screen opens, so the button tap itself can start it. Phones only allow sound from a tap.
  useEffect(() => {
    let gone = false;
    youtube().then((YT) => {
      if (gone || !mount.current || player.current) return;
      player.current = new YT.Player(mount.current, {
        host: 'https://www.youtube-nocookie.com', videoId: VIDEO, width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0, fs: 1, controls: 1 },
        events: { onStateChange: (e: { data: number }) => { if (e.data === 1) setNeedTap(false); } },
      });
    }).catch(() => undefined);
    return () => {
      gone = true;
      clearTimeout(timer.current);
      document.body.classList.remove('doom');
      try { player.current?.destroy(); } catch { /* ignore */ }
      player.current = null;
    };
  }, []);

  /** Runs inside the tap: sound on, play now. The overlay stays hidden until the siren is done. */
  const startVideo = () => {
    const p = player.current;
    if (!p) return;
    try { p.unMute(); p.playVideo(); } catch { /* the fallback button covers it */ }
  };

  /** When the video is revealed: if it is not actually playing with sound, show the big button. */
  const checkVideo = () => {
    const p = player.current;
    try { if (!p || p.getPlayerState() !== 1 || p.isMuted()) setNeedTap(true); } catch { setNeedTap(true); }
  };

  const tapToPlay = () => {
    const p = player.current;
    if (!p) return;
    try { p.unMute(); p.playVideo(); } catch { /* ignore */ }
    setNeedTap(false);
  };

  const press = () => {
    if (busy.current) return;
    busy.current = true;
    setPhase('siren');
    startVideo();
    // Ask for full screen while the tap still counts as a gesture. iPhones may refuse; the overlay below fills the screen anyway.
    try { void document.documentElement.requestFullscreen?.().catch(() => undefined); } catch { /* not supported */ }
    // The world is ending: shake and pulse the whole screen (CSS, calmer with reduced motion), buzz Android phones, then the video.
    document.body.classList.add('doom');
    try { navigator.vibrate?.([200, 100, 200, 100, 200, 100, 200, 100, 200]); } catch { /* not supported */ }
    const ms = siren(4) || 4000;
    timer.current = window.setTimeout(() => {
      document.body.classList.remove('doom');
      setPhase('video');
      busy.current = false;
      window.setTimeout(checkVideo, 600);
    }, ms);
  };

  const closeVideo = () => {
    setPhase('idle');
    setNeedTap(false);
    try { player.current?.stop(); } catch { /* ignore */ }
    try { navigator.vibrate?.(0); } catch { /* ignore */ }
    try { if (document.fullscreenElement) void document.exitFullscreen(); } catch { /* ignore */ }
  };

  return (
    <GameFrame title="Do Not Press" hint={phase === 'idle' ? 'Seriously. Do not press the button.' : undefined} onExit={() => go('home')}>
      <div className="grow" />
      {phase !== 'video' && (
        <button className={`bigred${phase === 'siren' ? ' alarm' : ''}`} onClick={press} aria-label="Do not press">
          {phase === 'siren' ? '🚨' : 'DO NOT PRESS'}
        </button>
      )}
      {phase === 'siren' && <p className="hint">Uh oh...</p>}
      {(
        <div className={`dnp-full${phase === 'video' ? '' : ' dnp-wait'}`} role="dialog" aria-label="Surprise video" aria-hidden={phase !== 'video'}>
          <div ref={mount} className="dnp-player" />
          {phase === 'video' && needTap && <button className="btn primary dnp-tap" onClick={tapToPlay}>▶ Tap to play 🔊</button>}
          {phase === 'video' && <button className="btn dnp-close" onClick={closeVideo}>✕ Close</button>}
        </div>
      )}
      <div className="grow" />
    </GameFrame>
  );
}
