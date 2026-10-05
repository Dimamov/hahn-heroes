// Delivers queued push notifications. Called every minute by the database (no input needed, so no secret is
// involved) and by the app to learn whether push is set up. Uses three secrets from the Supabase dashboard
// (Edge Functions, Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and optionally VAPID_SUBJECT.
// The private key never leaves this function. Deployed with JWT verification off.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { corsHeaders, json } from '../_shared/http.ts';
import { buildPayload, isDeadDevice, subjectFrom, validKeys, type PushMessage } from '../_shared/push.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const pub = Deno.env.get('VAPID_PUBLIC_KEY')?.trim();
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')?.trim();
  const configured = validKeys(pub, priv);
  const body = await req.json().catch(() => ({}));

  // The app asks this to show "push is not set up yet" or to subscribe. Only the public key is ever returned.
  if (body?.action === 'key') return json({ configured, key: configured ? pub : null });
  if (!configured) return json({ configured: false, sent: 0 });

  webpush.setVapidDetails(subjectFrom(Deno.env.get('VAPID_SUBJECT')), pub!, priv!);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const claimed = await sb.rpc('push_claim');
  if (claimed.error) return json({ error: 'server_error' }, 500);
  const messages = (claimed.data ?? []) as PushMessage[];

  const sentIds: number[] = [];
  const dead: string[] = [];
  let sent = 0;
  for (const m of messages) {
    const payload = buildPayload(m);
    const results = await Promise.allSettled(m.subs.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600 })));
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') sent += 1;
      else if (isDeadDevice((r.reason as { statusCode?: number })?.statusCode)) dead.push(m.subs[i].endpoint);
    });
    sentIds.push(m.id);
  }
  if (sentIds.length) await sb.rpc('push_finish', { p_sent: sentIds, p_dead: dead });
  // Housekeeping: old sent messages are not needed.
  await sb.from('push_outbox').delete().lt('created_at', new Date(Date.now() - 14 * 86400000).toISOString());
  return json({ configured: true, messages: messages.length, sent });
});
