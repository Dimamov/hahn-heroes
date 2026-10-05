import type { Backend } from './backend.ts';
import { createDemoBackend } from './demo-backend.ts';
import { createSupabaseBackend } from './supabase-backend.ts';

export function createBackend(): Backend {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (url && key) return createSupabaseBackend(url, key);
  return createDemoBackend(window.localStorage);
}
