-- Hero Defense joins the daily-reward arcade games (same 5 diamonds, same weekly arcade cap).
update public.app_settings
   set value = jsonb_set(value, '{games}', (value->'games') || '["hero-defense"]'::jsonb)
 where key = 'arcade_rewards' and not (value->'games') ? 'hero-defense';
