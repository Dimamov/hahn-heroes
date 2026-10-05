// Drafts a quiz from lesson text for an approved teacher. The teacher reviews and edits it before anything
// reaches students. Only the lesson text is sent to Claude: no student names or data. Students never call this.
// The API key is the ANTHROPIC_API_KEY secret (Supabase dashboard, Edge Functions, Secrets).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { LESSON_MAX, LESSON_MIN, MODEL, buildPrompt, parseQuiz } from '../_shared/lesson-ai.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  const body = await req.json().catch(() => null);

  // Only approved teachers get past this line (the database checks the signed-in account).
  const left = await sb.rpc('ai_left');
  if (left.error || !left.data) return json({ error: 'teachers_only' }, 403);

  if (body?.action === 'status') return json({ configured: !!key, limit: left.data.limit, left: left.data.left });
  if (!key) return json({ error: 'not_set_up' }, 503);

  const lesson = typeof body?.lesson === 'string' ? body.lesson.trim() : '';
  const grade = body?.grade === 6 ? 6 : 5;
  const count = Number.isInteger(body?.count) ? Math.min(10, Math.max(3, body.count)) : 5;
  if (lesson.length < LESSON_MIN) return json({ error: 'too_short' }, 400);
  if (lesson.length > LESSON_MAX) return json({ error: 'too_long' }, 400);

  const claim = await sb.rpc('ai_claim');
  if (claim.error) return json({ error: 'server_error' }, 500);
  if (!claim.data.ok) return json({ error: 'daily_limit', limit: claim.data.limit }, 429);

  const refund = async () => { await sb.rpc('ai_refund'); };
  const p = buildPrompt(lesson, grade, count);
  let text = '';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 3000, system: p.system, messages: [{ role: 'user', content: p.user }] }),
    });
    if (!res.ok) { await refund(); return json({ error: 'ai_unavailable' }, 502); }
    const data = await res.json();
    text = (data?.content ?? []).map((c: { type: string; text?: string }) => (c.type === 'text' ? c.text : '')).join('');
  } catch {
    await refund();
    return json({ error: 'ai_unavailable' }, 502);
  }
  const quiz = parseQuiz(text, count);
  if (!quiz) { await refund(); return json({ error: 'bad_output' }, 502); }
  return json({ quiz, left: claim.data.left });
});
