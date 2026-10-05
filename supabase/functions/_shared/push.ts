// Pure pieces of the push-send function, kept apart so they can be tested without Deno or the network.
export interface PushMessage { id: number; kind: string; title: string; body: string; subs: PushSub[] }
export interface PushSub { endpoint: string; p256dh: string; auth: string }

export const DEFAULT_SUBJECT = 'mailto:info@detcorddigital.com';

/** The text shown on the lock screen. Short, no names, and the page it opens. */
export function buildPayload(m: Pick<PushMessage, 'kind' | 'title' | 'body'>): string {
  return JSON.stringify({ title: m.title.slice(0, 80), body: m.body.slice(0, 140), tag: m.kind, url: '/' });
}

/** A device that answers 404 or 410 has been uninstalled or revoked, so we stop sending to it. */
export function isDeadDevice(status: number | undefined): boolean {
  return status === 404 || status === 410;
}

/** VAPID keys are a pair of URL-safe base64 strings; reject anything that clearly is not one. */
export function validKeys(pub: string | undefined, priv: string | undefined): boolean {
  const ok = (s: string | undefined, len: number) => !!s && /^[A-Za-z0-9_-]+$/.test(s) && s.length >= len;
  return ok(pub, 80) && ok(priv, 40);
}

export function subjectFrom(raw: string | undefined): string {
  return raw && /^(mailto:|https:\/\/)/.test(raw) ? raw : DEFAULT_SUBJECT;
}
