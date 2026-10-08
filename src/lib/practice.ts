// Practice views for the Sensei: a throwaway demo copy of the app, held in memory only.
// Nothing here is real, saved, or shared with any child or parent account.
import { createDemoBackend } from './demo-backend.ts';
import type { Backend } from './backend.ts';

const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem'> => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
};

/** A fresh demo app, already signed in as a practice student or a practice parent. */
export async function practiceBackend(kind: 'student' | 'parent'): Promise<Backend> {
  const backend = createDemoBackend(memoryStorage());
  if (kind === 'student') await backend.signUp({ grade: 5, hero: 'ana', nameAdjective: 'Brave', nameNoun: 'Comet', picture: [0, 1, 2, 3] });
  else await backend.adultSignUp('practice@example.com', 'practice-view', 'parent', 'Practice Parent');
  return backend;
}
