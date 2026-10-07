import { useEffect, useState } from 'react';
import { isChromebook } from '../lib/device.ts';
import './install-prompt.css';

const SEEN = 'hahn-install-seen';
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// Chrome fires this once, early. Keep it so the Install button works whenever the pop-up opens.
let deferred: InstallEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; });
}

/** Which instructions to show, or null when the pop-up should stay away (installed, desktop, school Chromebook). */
export function installKind(env: { ua: string; standalone: boolean; chromebook: boolean; touchMac?: boolean }): 'ios' | 'android' | null {
  if (env.standalone || env.chromebook) return null;
  if (/iPhone|iPad|iPod/.test(env.ua) || env.touchMac) return 'ios';
  if (/Android/.test(env.ua)) return 'android';
  return null;
}

function currentKind() {
  try {
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
    const touchMac = /Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1; // iPads that look like Macs
    return installKind({ ua: nav.userAgent, standalone: !!standalone, chromebook: isChromebook(), touchMac });
  } catch { return null; }
}

/** First login on a phone or tablet: a big, friendly "put me on your home screen" pop-up. Shown once per device. */
export function InstallPrompt() {
  const [kind] = useState(() => {
    try { if (localStorage.getItem(SEEN)) return null; } catch { /* blocked storage: show it once per visit */ }
    return currentKind();
  });
  const [open, setOpen] = useState(kind !== null);
  const [canInstall, setCanInstall] = useState(!!deferred);
  useEffect(() => {
    const on = () => setCanInstall(!!deferred);
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);

  const close = () => {
    try { localStorage.setItem(SEEN, '1'); } catch { /* blocked storage */ }
    setOpen(false);
  };
  const install = async () => {
    if (!deferred) return;
    try { await deferred.prompt(); await deferred.userChoice; } catch { /* dismissed */ }
    deferred = null;
    close();
  };
  if (!open || !kind) return null;

  return (
    <div className="install-pop" role="dialog" aria-modal="true" aria-label="Add HAHN Heroes to your home screen">
      <div className="install-card">
        <div className="install-icon" aria-hidden>📲</div>
        <h2>Make it an app!</h2>
        <p className="install-lead">Put HAHN Heroes on your home screen so it opens like a real app, full screen, with alerts from the Sensei.</p>
        {kind === 'ios' && (
          <ol className="install-steps">
            <li>Open this page in <b>Safari</b>.</li>
            <li>Tap the <b>Share</b> button <span className="install-glyph" aria-hidden>⬆️</span> at the bottom (or top) of the screen.</li>
            <li>Scroll down and tap <b>Add to Home Screen</b> ➕.</li>
            <li>Tap <b>Add</b>. Then open HAHN Heroes from your home screen.</li>
          </ol>
        )}
        {kind === 'android' && canInstall && (
          <>
            <p className="install-lead">Tap the button and say yes.</p>
            <button className="btn primary" onClick={install}>Install HAHN Heroes</button>
          </>
        )}
        {kind === 'android' && !canInstall && (
          <ol className="install-steps">
            <li>Open this page in <b>Chrome</b>.</li>
            <li>Tap the <b>⋮</b> menu at the top right.</li>
            <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
            <li>Tap <b>Install</b>. Then open HAHN Heroes from your home screen.</li>
          </ol>
        )}
        <button className="btn ghost" onClick={close}>Maybe later</button>
      </div>
    </div>
  );
}
