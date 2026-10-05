// Offline practice: answers given without Wi-Fi wait in a small queue on this device and are
// sent when the connection returns. The server still checks every answer and pays the points, so
// nothing is decided here. The last question set per subject is kept so practice can start offline.
import type { Backend, PracticeSet, Subject } from './backend.ts';

export interface QueuedAnswer { hero: string; id: string; choice: number; subject: Subject }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const QUEUE_KEY = 'hh-offline-answers';
const SET_KEY = (hero: string, s: Subject) => `hh-practice-set-${hero}-${s}`;
const MAX_QUEUE = 100;

const store = (): Store | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const readJson = <T>(s: Store | null, key: string, fallback: T): T => {
  try { const v = s?.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const writeJson = (s: Store | null, key: string, v: unknown) => { try { s?.setItem(key, JSON.stringify(v)); } catch { /* storage full or blocked: carry on */ } };

/** True when a failed call looks like a lost connection, not a "no" from the server. */
export function looksOffline(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const m = err instanceof Error ? err.message : String(err ?? '');
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout/i.test(m);
}

/** Every waiting answer on this device; each belongs to one hero. */
export const queuedAnswers = (s: Store | null = store()): QueuedAnswer[] => readJson<QueuedAnswer[]>(s, QUEUE_KEY, []);

export function queueAnswer(a: QueuedAnswer, s: Store | null = store()): boolean {
  const q = queuedAnswers(s);
  if (q.some((x) => x.hero === a.hero && x.id === a.id)) return true;
  if (q.length >= MAX_QUEUE) return false;
  writeJson(s, QUEUE_KEY, [...q, a]);
  return true;
}

export function cacheSet(hero: string, subject: Subject, set: PracticeSet, s: Store | null = store()) {
  writeJson(s, SET_KEY(hero, subject), set);
}

/** The saved set without questions already answered or waiting in the queue. */
export function cachedSet(hero: string, subject: Subject, s: Store | null = store()): PracticeSet | null {
  const set = readJson<PracticeSet | null>(s, SET_KEY(hero, subject), null);
  if (!set) return null;
  const waiting = new Set(queuedAnswers(s).filter((a) => a.hero === hero).map((a) => a.id));
  const questions = set.questions.filter((q) => !waiting.has(q.id));
  return questions.length ? { questions, remaining: set.remaining } : null;
}

/** Forget a question that was answered online, so it never comes back offline. */
export function dropFromCache(hero: string, subject: Subject, questionId: string, s: Store | null = store()) {
  const set = readJson<PracticeSet | null>(s, SET_KEY(hero, subject), null);
  if (set) writeJson(s, SET_KEY(hero, subject), { ...set, questions: set.questions.filter((q) => q.id !== questionId) });
}

/** Sends this hero's waiting answers in order. Stops at the first lost connection; a refused answer is dropped. */
export async function flushAnswers(backend: Backend, hero: string, s: Store | null = store()): Promise<{ sent: number; left: number }> {
  let sent = 0;
  for (const a of queuedAnswers(s).filter((x) => x.hero === hero)) {
    try { await backend.answerQuestion(a.id, a.choice); sent += 1; }
    catch (e) { if (looksOffline(e)) break; }
    writeJson(s, QUEUE_KEY, queuedAnswers(s).filter((x) => !(x.hero === a.hero && x.id === a.id)));
  }
  return { sent, left: queuedAnswers(s).filter((x) => x.hero === hero).length };
}
