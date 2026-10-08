-- Gate Runner joins the daily-reward arcade games (same 5 diamonds, same weekly arcade cap).
update public.app_settings
   set value = jsonb_set(value, '{games}', (value->'games') || '["gate-runner"]'::jsonb)
 where key = 'arcade_rewards' and not (value->'games') ? 'gate-runner';
