-- Class streak goal: the teacher turns on a goal for the week ("most of us practice on 4 school days"). A school day counts
-- when enough of the class answered at least one practice question that day. Everyone who joined in earns a shared reward once.
insert into public.app_settings (key, value) values ('class_goal', '{"coins": 20, "xp": 10}') on conflict (key) do nothing;

create table public.class_goals (
  class_id uuid not null references public.classes (id) on delete cascade,
  week_start date not null,
  target_days int not null check (target_days between 1 and 5),
  share int not null default 80 check (share between 50 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (class_id, week_start)
);
alter table public.class_goals enable row level security;
revoke all on public.class_goals from anon, authenticated;

create function public.class_goal_set(p_class uuid, p_days int, p_share int default 80) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not teaches_class(p_class) then raise exception 'not your class'; end if;
  insert into class_goals (class_id, week_start, target_days, share, active) values (p_class, school_week(now()), p_days, p_share, true)
  on conflict (class_id, week_start) do update set target_days = excluded.target_days, share = excluded.share, active = true;
end $$;

-- Turn this week's goal off (kept, not erased).
create function public.class_goal_off(p_class uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not teaches_class(p_class) then raise exception 'not your class'; end if;
  update class_goals set active = false where class_id = p_class and week_start = school_week(now());
end $$;

-- Progress for one class this week. A teacher passes the class; a student leaves it null and gets their own class.
create function public.class_goal_status(p_class uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid(); v_class uuid := p_class; v_week date := school_week(now()); g class_goals; v_teacher boolean;
  v_members int; v_days jsonb; v_hit int; v_mine int := 0; v_claimed boolean := false; v_met boolean;
begin
  if v_class is null then select class_id into v_class from class_members where child_id = v_me order by joined_at limit 1; end if;
  if v_class is null then return null; end if;
  v_teacher := teaches_class(v_class);
  if not v_teacher and not exists (select 1 from class_members where class_id = v_class and child_id = v_me) then raise exception 'not your class'; end if;
  select * into g from class_goals where class_id = v_class and week_start = v_week and active;
  if g.class_id is null then return jsonb_build_object('on', false, 'class_id', v_class); end if;
  select count(*) into v_members from class_members where class_id = v_class;
  select coalesce(jsonb_agg(jsonb_build_object('date', d, 'active', n, 'hit', v_members > 0 and n * 100 >= g.share * v_members) order by d), '[]'::jsonb),
         count(*) filter (where v_members > 0 and n * 100 >= g.share * v_members)
    into v_days, v_hit
    from (select d::date d, (select count(distinct m.child_id) from class_members m join question_history h on h.child_id = m.child_id
                              where m.class_id = v_class and h.answered_at is not null and school_date(h.answered_at) = d::date) n
            from generate_series(v_week, v_week + 4, interval '1 day') d
           where d::date <= school_date(now())) x;
  v_met := v_hit >= g.target_days;
  if not v_teacher then
    select count(distinct school_date(h.answered_at)) into v_mine from question_history h
     where h.child_id = v_me and h.answered_at is not null and school_week(h.answered_at) = v_week;
    v_claimed := exists (select 1 from ledger_entries where child_id = v_me and idempotency_key = 'goal:' || v_class || ':' || v_week);
  end if;
  return jsonb_build_object('on', true, 'class_id', v_class, 'class_name', (select name from classes where id = v_class),
    'target_days', g.target_days, 'share', g.share, 'members', v_members, 'days', v_days, 'days_hit', v_hit, 'met', v_met,
    'role', case when v_teacher then 'teacher' else 'student' end, 'my_days', v_mine, 'claimed', v_claimed,
    'can_claim', (not v_teacher) and v_met and v_mine >= 1 and not v_claimed,
    'reward', (setting('class_goal')->>'coins')::int);
end $$;

create function public.class_goal_claim() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s jsonb := class_goal_status(null); v_rules jsonb := setting('class_goal'); v_key text;
begin
  if s is null or not coalesce((s->>'can_claim')::boolean, false) then raise exception 'nothing to claim yet'; end if;
  v_key := 'goal:' || (s->>'class_id') || ':' || school_week(now());
  perform award(me_hero(), 'coins', (v_rules->>'coins')::int, 'class_mission', 'Class goal', v_key);
  perform award(me_hero(), 'xp', (v_rules->>'xp')::int, 'class_mission', 'Class goal', v_key);
  return jsonb_build_object('coins', (v_rules->>'coins')::int);
end $$;

revoke execute on function public.class_goal_set(uuid, int, int), public.class_goal_off(uuid), public.class_goal_status(uuid), public.class_goal_claim() from public, anon;
grant execute on function public.class_goal_set(uuid, int, int), public.class_goal_off(uuid), public.class_goal_status(uuid), public.class_goal_claim() to authenticated;
