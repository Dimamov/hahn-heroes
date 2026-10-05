-- Daily streaks and the daily quest. Both are worked out from the ledger, so nothing can be faked:
-- a streak is consecutive school days with a daily check-in; the quest is three things done today.
create function public.streak_info(p_hero uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with d as (
    select distinct substring(idempotency_key from 7)::date as day
      from ledger_entries
     where child_id = p_hero and currency = 'coins' and idempotency_key ~ '^daily:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  ), s as (
    select day, day - (row_number() over (order by day))::int as grp from d
  ), anchor as (
    select case when exists (select 1 from d where day = school_date(now())) then school_date(now()) else school_date(now()) - 1 end as day
  ), run as (
    select min(s.day) as start_day, count(*) as days
      from s where s.grp = (select s2.grp from s s2, anchor a where s2.day = a.day)
  )
  select jsonb_build_object('days', coalesce((select days from run), 0), 'start', (select start_day from run))
$$;

create function public.quest_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_today date := school_date(now());
  v_streak jsonb := streak_info(me);
  v_days int := (v_streak->>'days')::int;
  v_checked boolean;
  v_learn int;
  v_game boolean;
  v_miles jsonb := '[{"days":3,"coins":5},{"days":7,"coins":15},{"days":14,"coins":30},{"days":30,"coins":60}]';
begin
  v_checked := exists (select 1 from ledger_entries where child_id = me and currency = 'coins' and idempotency_key = 'daily:' || v_today);
  select count(*) into v_learn from ledger_entries
   where child_id = me and currency = 'coins' and idempotency_key like 'learn:%' and school_date(created_at) = v_today;
  v_game := exists (select 1 from ledger_entries where child_id = me and currency = 'coins' and idempotency_key like 'arcade:%' and school_date(created_at) = v_today);
  return jsonb_build_object(
    'streak', v_days,
    'milestones', (select jsonb_agg(jsonb_build_object('days', (m->>'days')::int, 'coins', (m->>'coins')::int,
        'reached', v_days >= (m->>'days')::int,
        'claimed', exists (select 1 from ledger_entries where child_id = me and currency = 'coins'
                            and idempotency_key = 'streak:' || (v_streak->>'start') || ':' || (m->>'days'))) order by (m->>'days')::int)
      from jsonb_array_elements(v_miles) m),
    'tasks', jsonb_build_array(
      jsonb_build_object('id', 'checkin', 'label', 'Collect your daily check-in', 'have', case when v_checked then 1 else 0 end, 'need', 1),
      jsonb_build_object('id', 'learn', 'label', 'Get 3 Learn answers right', 'have', least(v_learn, 3), 'need', 3),
      jsonb_build_object('id', 'game', 'label', 'Collect an Arcade reward', 'have', case when v_game then 1 else 0 end, 'need', 1)),
    'quest_coins', 10,
    'quest_claimed', exists (select 1 from ledger_entries where child_id = me and currency = 'coins' and idempotency_key = 'quest:' || v_today));
end $$;

create function public.quest_claim() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  s jsonb := quest_state();
  t jsonb;
begin
  for t in select jsonb_array_elements(s->'tasks') loop
    if (t->>'have')::int < (t->>'need')::int then raise exception 'finish all three tasks first'; end if;
  end loop;
  if (s->>'quest_claimed')::boolean then return jsonb_build_object('awarded', 0, 'duplicate', true); end if;
  perform award(me, 'xp', 5, 'streak', 'Daily quest', 'quest:' || school_date(now()));
  return award(me, 'coins', 10, 'streak', 'Daily quest', 'quest:' || school_date(now()));
end $$;

create function public.streak_claim(p_days int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  s jsonb := quest_state();
  m jsonb;
begin
  select x into m from jsonb_array_elements(s->'milestones') x where (x->>'days')::int = p_days;
  if m is null then raise exception 'no such milestone'; end if;
  if not (m->>'reached')::boolean then raise exception 'not there yet'; end if;
  return award(me, 'coins', (m->>'coins')::int, 'streak', p_days || ' day streak',
               'streak:' || (streak_info(me)->>'start') || ':' || p_days);
end $$;

revoke execute on function public.streak_info(uuid), public.quest_state(), public.quest_claim(), public.streak_claim(int) from public, anon;
grant execute on function public.quest_state(), public.quest_claim(), public.streak_claim(int) to authenticated;
