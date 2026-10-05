// Gives a signed-in hero a short AI hint for a practice question. The client sends only a question id: the
// question text comes from our own bank, so this can never be used to chat or to send anything about a child.
// If anything fails the app uses a built-in hint. The API key is the ANTHROPIC_API_KEY secret.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { HINT_MODEL, buildHintPrompt, cleanHint } from '../_shared/hint-ai.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id.slice(0, 64) : '';
  if (!id) return json({ error: 'bad_request' }, 400);
  if (!key) return json({ error: 'not_set_up' }, 503);

  const src = await sb.rpc('hint_source', { p_id: id });
  if (src.error || !src.data) return json({ error: 'not_found' }, 404);
  const choices: string[] = Array.isArray(src.data.choices) ? src.data.choices.map(String) : [];

  const claim = await sb.rpc('hint_claim');
  if (claim.error) return json({ error: 'server_error' }, 500);
  if (!claim.data.ok) return json({ error: 'daily_limit', limit: claim.data.limit }, 429);
  const refund = async () => { await sb.rpc('hint_refund'); };

  const p = buildHintPrompt(String(src.data.prompt), choices);
  let text = '';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: HINT_MODEL, max_tokens: 150, system: p.system, messages: [{ role: 'user', content: p.user }] }),
    });
    if (!res.ok) { await refund(); return json({ error: 'ai_unavailable' }, 502); }
    const data = await res.json();
    text = (data?.content ?? []).map((c: { type: string; text?: string }) => (c.type === 'text' ? c.text : '')).join('');
  } catch {
    await refund();
    return json({ error: 'ai_unavailable' }, 502);
  }
  const hint = cleanHint(text, choices);
  if (!hint) { await refund(); return json({ error: 'bad_output' }, 502); }
  return json({ hint, left: claim.data.left });
});
