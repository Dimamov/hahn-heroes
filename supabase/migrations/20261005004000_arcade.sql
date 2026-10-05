-- Solo arcade: each reward game pays once per school day. Small amounts, and a weekly cap,
-- so playing more never means earning more. Learning stays the way to earn real progress.

update public.app_settings set value = value || '{"game": 100}'::jsonb where key = 'weekly_caps';
insert into public.app_settings (key, value) values
  ('arcade_rewards', '{"coins": 5, "xp": 3, "games": ["pattern-pulse", "memory-flip", "word-builder", "spot-difference"]}')
on conflict (key) do nothing;

create function public.arcade_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_child uuid := auth.uid();
  v_cfg jsonb := setting('arcade_rewards');
begin
  if v_child is null or not exists (select 1 from heroes where id = v_child) then raise exception 'not signed in'; end if;
  return jsonb_build_object(
    'coins', (v_cfg->>'coins')::int,
    'games', v_cfg->'games',
    'claimed', coalesce((select jsonb_agg(split_part(idempotency_key, ':', 2))
                           from ledger_entries
                          where child_id = v_child and currency = 'coins' and source = 'game'
                            and idempotency_key like 'arcade:%:' || school_date(now())::text), '[]'::jsonb));
end $$;

create function public.arcade_claim(p_game text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_child uuid := auth.uid();
  v_cfg jsonb := setting('arcade_rewards');
  v_key text;
  v_coins jsonb;
begin
  if v_child is null or not exists (select 1 from heroes where id = v_child) then raise exception 'not signed in'; end if;
  if not (v_cfg->'games') ? p_game then raise exception 'unknown game'; end if;
  v_key := 'arcade:' || p_game || ':' || school_date(now())::text;
  v_coins := award(v_child, 'coins', (v_cfg->>'coins')::int, 'game', 'Arcade: ' || p_game, v_key);
  if not (v_coins->>'duplicate')::boolean then
    perform award(v_child, 'xp', (v_cfg->>'xp')::int, 'game', 'Arcade: ' || p_game, v_key);
  end if;
  return v_coins;
end $$;

revoke execute on function public.arcade_status(), public.arcade_claim(text) from public, anon;
grant execute on function public.arcade_status(), public.arcade_claim(text) to authenticated;
