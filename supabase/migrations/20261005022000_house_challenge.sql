-- Weekly House challenge: the Sensei sets a theme and a goal for the week. A House reaches it when
-- its average points per hero (the same fair measure as the leaderboard) hits the goal. Each hero
-- who helped (at least 10 points) collects the reward once.
create table public.house_challenges (
  week date primary key,
  theme text not null,
  goal int not null check (goal between 5 and 80),
  coins int not null check (coins between 5 and 50),
  set_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
alter table public.house_challenges enable row level security;
revoke all on public.house_challenges from anon, authenticated;

create function public.house_avg(p_class uuid, p_week date) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(w.pts), 0)::numeric / greatest(count(m.child_id), 1)
    from class_members m left join house_weekly() w on w.child_id = m.child_id and w.week = p_week
   where m.class_id = p_class
$$;

create function public.house_challenge() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_week date := school_week(now());
  c house_challenges;
  v_class uuid;
  v_avg numeric;
  v_mine int;
begin
  select * into c from house_challenges where week = v_week;
  if c.week is null then return jsonb_build_object('state', 'none'); end if;
  select class_id into v_class from class_members where child_id = me;
  if v_class is null or not exists (select 1 from houses where class_id = v_class) then
    return jsonb_build_object('state', 'no_house', 'theme', c.theme, 'goal', c.goal, 'coins', c.coins);
  end if;
  v_avg := house_avg(v_class, v_week);
  select coalesce(sum(pts), 0) into v_mine from house_weekly() w where w.child_id = me and w.week = v_week;
  return jsonb_build_object('state', 'active', 'theme', c.theme, 'goal', c.goal, 'coins', c.coins,
    'progress', round(v_avg, 1), 'reached', v_avg >= c.goal, 'my_points', v_mine, 'need_mine', 10,
    'claimed', exists (select 1 from ledger_entries where child_id = me and currency = 'coins' and idempotency_key = 'hchal:' || v_week));
end $$;

create function public.house_challenge_claim() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  s jsonb := house_challenge();
begin
  if s->>'state' <> 'active' then raise exception 'no challenge for your House'; end if;
  if not (s->>'reached')::boolean then raise exception 'your House has not reached the goal yet'; end if;
  if (s->>'my_points')::int < (s->>'need_mine')::int then raise exception 'earn at least 10 points yourself first'; end if;
  perform award(me, 'xp', 5, 'event', 'House challenge', 'hchal:' || school_week(now()));
  return award(me, 'coins', (s->>'coins')::int, 'event', 'House challenge', 'hchal:' || school_week(now()));
end $$;

create function public.sensei_set_challenge(p_theme text, p_goal int, p_coins int) returns void
language plpgsql security definer set search_path = public as $$
declare v text := regexp_replace(trim(coalesce(p_theme, '')), '\s+', ' ', 'g');
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do that'; end if;
  if v !~ '^[A-Za-z][A-Za-z ,.!''-]{2,39}$' then raise exception 'theme needs 3 to 40 letters'; end if;
  if chat_flagged(v) then raise exception 'pick different words'; end if;
  if p_goal not between 5 and 80 then raise exception 'goal is 5 to 80 points per hero'; end if;
  if p_coins not between 5 and 50 then raise exception 'reward is 5 to 50 points'; end if;
  insert into house_challenges (week, theme, goal, coins, set_by) values (school_week(now()), v, p_goal, p_coins, auth.uid())
  on conflict (week) do update set theme = excluded.theme, goal = excluded.goal, coins = excluded.coins, set_by = excluded.set_by, updated_at = now();
end $$;

create function public.sensei_challenge_view() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_week date := school_week(now());
  c house_challenges;
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do that'; end if;
  select * into c from house_challenges where week = v_week;
  return jsonb_build_object('theme', c.theme, 'goal', c.goal, 'coins', c.coins,
    'houses', coalesce((select jsonb_agg(jsonb_build_object('name', h.name, 'members', n, 'progress', round(house_avg(h.class_id, v_week), 1)) order by house_avg(h.class_id, v_week) desc)
       from houses h cross join lateral (select count(*) n from class_members m where m.class_id = h.class_id) x
      where n >= (setting('house_rules')->>'min_members')::int), '[]'::jsonb));
end $$;

revoke execute on function public.house_avg(uuid, date), public.house_challenge(), public.house_challenge_claim(),
  public.sensei_set_challenge(text, int, int), public.sensei_challenge_view() from public, anon;
grant execute on function public.house_challenge(), public.house_challenge_claim(),
  public.sensei_set_challenge(text, int, int), public.sensei_challenge_view() to authenticated;
