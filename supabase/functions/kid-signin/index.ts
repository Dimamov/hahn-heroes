// Signs a student in with a hero code and picture password, with attempt limits.
// Returns a normal Supabase session the app uses from then on.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { deriveKidPassword, isValidHeroCode, isValidPicture, kidAuthEmail, normalizeHeroCode } from '../_shared/kid-auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const body = await req.json().catch(() => null);
  const code = normalizeHeroCode(String(body?.heroCode ?? ''));
  if (!isValidHeroCode(code) || !isValidPicture(body?.picture)) return json({ error: 'invalid_request' }, 400);

  const secret = Deno.env.get('KID_AUTH_SECRET');
  if (!secret || secret.length < 32) return json({ error: 'server_not_configured' }, 500);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const { data: gate, error: gateError } = await admin.rpc('check_sign_in', { p_hero_code: code, p_ip: ip });
  if (gateError) return json({ error: 'server_error' }, 500);
  if (gate.locked) return json({ error: 'resting', retryAfter: gate.retry_after }, 429);

  const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({
    email: kidAuthEmail(code),
    password: await deriveKidPassword(secret, code, body.picture),
  });

  if (error || !data.session) {
    await admin.rpc('record_sign_in', { p_hero_code: code, p_ip: ip, p_succeeded: false });
    // Same answer for "no such code" and "wrong pictures", so codes can't be probed.
    return json({ error: 'wrong_code_or_pictures', triesLeft: Math.max(0, gate.remaining - 1) }, 401);
  }

  await admin.rpc('record_sign_in', { p_hero_code: code, p_ip: ip, p_succeeded: true });
  return json({
    session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
  });
});
