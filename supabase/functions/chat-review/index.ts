// Sensei-only second check of saved chat. Reads a batch of unchecked messages (text only, no names), asks Claude which ones
// look worrying, and saves the answer as flags for the Sensei to review. It never blocks, edits or removes any message.
// The API key is the ANTHROPIC_API_KEY secret (Supabase dashboard, Edge Functions, Secrets).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { CHAT_MODEL, buildChatPrompt, parseChatVerdicts } from '../_shared/chat-ai.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false },
  });
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  const body = await req.json().catch(() => null);

  // The database only answers for the signed-in Sensei.
  const batch = await sb.rpc('sensei_chat_ai_batch');
  if (batch.error) return json({ error: 'sensei_only' }, 403);
  if (body?.action === 'status') return json({ configured: !!key, waiting: batch.data.length });
  if (!key) return json({ error: 'not_set_up' }, 503);
  const items = batch.data as { key: string; body: string }[];
  if (items.length === 0) return json({ checked: 0, flagged: 0 });

  const p = buildChatPrompt(items);
  let text = '';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: CHAT_MODEL, max_tokens: 1500, system: p.system, messages: [{ role: 'user', content: p.user }] }),
    });
    if (!res.ok) return json({ error: 'ai_unavailable' }, 502);
    const data = await res.json();
    text = (data?.content ?? []).map((c: { type: string; text?: string }) => (c.type === 'text' ? c.text : '')).join('');
  } catch {
    return json({ error: 'ai_unavailable' }, 502);
  }
  const verdicts = parseChatVerdicts(text, items);
  if (!verdicts) return json({ error: 'bad_output' }, 502);
  const saved = await sb.rpc('sensei_chat_ai_save', { p_results: verdicts });
  if (saved.error) return json({ error: 'server_error' }, 500);
  return json({ checked: verdicts.length, flagged: verdicts.filter((v) => v.flagged).length });
});
