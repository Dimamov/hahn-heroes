import type { Backend, PushPrefs } from './backend.ts';

export type PushSupport = 'ok' | 'needs-install' | 'unsupported';

/** What this device can do. iPhones and iPads only allow push once the app is on the home screen. */
export function pushSupport(env: { ua: string; standalone: boolean; hasApis: boolean } = currentEnv()): PushSupport {
  const ios = /iPhone|iPad|iPod/.test(env.ua);
  if (ios && !env.standalone) return 'needs-install';
  return env.hasApis ? 'ok' : 'unsupported';
}

function currentEnv() {
  const nav = typeof navigator === 'undefined' ? ({} as Navigator) : navigator;
  const standalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (nav as unknown as { standalone?: boolean }).standalone === true);
  const hasApis = typeof window !== 'undefined' && 'serviceWorker' in nav && 'PushManager' in window && 'Notification' in window;
  return { ua: nav.userAgent ?? '', standalone: !!standalone, hasApis };
}

export function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** The toggles each kind of person sees. */
export const PUSH_KINDS: Record<'kid' | 'parent' | 'sensei', { key: keyof PushPrefs; label: string }[]> = {
  kid: [
    { key: 'chore_accepted', label: 'When my chore is accepted' },
    { key: 'quiz_soon', label: 'Trivia Night is about to start' },
    { key: 'sensei_message', label: 'Messages from the Sensei' },
  ],
  sensei: [
    { key: 'sensei_message', label: 'A hero writes to the Sensei inbox' },
  ],
  parent: [
    { key: 'chore_waiting', label: 'A chore is waiting for my approval' },
    { key: 'weekly_summary', label: 'My weekly summary' },
    { key: 'sensei_message', label: 'Messages from the Sensei' },
  ],
};

/** Is this browser already subscribed on this device? */
export async function deviceSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch { return null; }
}

/** Asks permission, subscribes this device and tells the server. Throws 'denied' when the person says no. */
export async function enablePush(backend: Backend, key: string): Promise<void> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('denied');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) throw new Error('bad_subscription');
  await backend.pushSubscribe({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
}

export async function disablePush(backend: Backend): Promise<void> {
  const sub = await deviceSubscription();
  if (!sub) return;
  await backend.pushUnsubscribe(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}
