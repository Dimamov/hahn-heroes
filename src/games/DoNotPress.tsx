import { useEffect, useRef, useState } from 'react';
import { GameFrame } from './GameFrame.tsx';
import { useSession } from '../App.tsx';
import { siren } from '../lib/sound.ts';

interface YTPlayer { playVideo(): void; mute(): void; unMute(): void; isMuted(): boolean; getPlayerState(): number; destroy(): void }
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
  useEffect(() => () => {
    clearTimeout(timer.current);
    document.body.classList.remove('doom');
    try { player.current?.destroy(); } catch { /* ignore */ }
  }, []);

  /** Builds the player right inside the tap so the browser counts it as the viewer's own choice. */
  const prepare = () => {
    youtube().then((YT) => {
      if (!mount.current || player.current) return;
      player.current = new YT.Player(mount.current, {
        videoId: VIDEO, width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0, fs: 1, controls: 1 },
        events: {
          onReady: () => { player.current?.mute(); },
          onStateChange: (e: { data: number }) => { if (e.data === 1) setNeedTap(false); },
        },
      });
    }).catch(() => setNeedTap(true));
  };

  /** Starts the video: muted first (always allowed), then sound; a big button covers a browser that still says no. */
  const startVideo = () => {
    const p = player.current;
    if (!p) { setNeedTap(true); return; }
    try { p.mute(); p.playVideo(); } catch { setNeedTap(true); return; }
    window.setTimeout(() => {
      try { p.unMute(); } catch { /* ignore */ }
    }, 400);
    window.setTimeout(() => {
      try { if (p.getPlayerState() !== 1 || p.isMuted()) setNeedTap(true); } catch { setNeedTap(true); }
    }, 1500);
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
    prepare();
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
      startVideo();
    }, ms);
  };

  const closeVideo = () => {
    setPhase('idle');
    setNeedTap(false);
    try { player.current?.destroy(); } catch { /* ignore */ }
    player.current = null;
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
      {phase !== 'idle' && (
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
