// Creates a student account: a hero code, a picture password and a hero. No email involved.
// Needs the secret KID_AUTH_SECRET (a long random string only the server knows).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import {
  deriveKidPassword, generateHeroCode, heroDisplayName, isGrade, isStarterHero, isValidPicture, kidAuthEmail,
} from '../_shared/kid-auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const body = await req.json().catch(() => null);
  const name = heroDisplayName(body?.nameAdjective, body?.nameNoun);
  if (!name || !isGrade(body?.grade) || !isStarterHero(body?.hero) || !isValidPicture(body?.picture)) {
    return json({ error: 'invalid_request' }, 400);
  }

  const secret = Deno.env.get('KID_AUTH_SECRET');
  if (!secret || secret.length < 32) return json({ error: 'server_not_configured' }, 500);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // A taken code is rare (31^8 codes); try a few times before giving up.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateHeroCode();
    const { data, error } = await admin.auth.admin.createUser({
      email: kidAuthEmail(code),
      password: await deriveKidPassword(secret, code, body.picture),
      email_confirm: true,
      app_metadata: { role: 'student' },
    });
    if (error || !data.user) continue;

    const { error: heroError } = await admin.from('heroes').insert({
      id: data.user.id, hero_code: code, display_name: name, grade: body.grade, starter_hero: body.hero,
    });
    if (heroError) {
      if (heroError.code === '23505') {
        await admin.auth.admin.deleteUser(data.user.id);
        continue;
      }
      await admin.auth.admin.deleteUser(data.user.id);
      return json({ error: 'could_not_create_hero' }, 500);
    }
    return json({ heroCode: code, displayName: name });
  }
  return json({ error: 'could_not_create_hero' }, 500);
});
