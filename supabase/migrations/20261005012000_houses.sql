-- Classroom Houses and leaderboards. A teacher proposes two or three House identities (name, colour, power,
-- motto) and the class votes. House credit comes only from verified learning: every correct answer is worth the
-- same, whatever it was answered in (practice, a room game or a class mission). Each hero's credit is capped per
-- week, and a House's score is its points per member, so a big class never wins just by being big. Purchases,
-- Surge and power-ups do not touch it. Nothing is deleted: closed votes are marked, not removed.

create table public.house_options (
  id bigint generated always as identity primary key,
  class_id uuid not null references public.classes (id) on delete cascade,
  idx int not null,
  name text not null,
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  power text not null check (power in ('flame', 'storm', 'tide', 'frost', 'earth', 'light', 'star', 'wind')),
  motto text not null default '',
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (class_id, idx)
);
create table public.house_votes (
  class_id uuid not null references public.classes (id) on delete cascade,
  child_id uuid not null references public.heroes (id) on delete cascade,
  option_id bigint not null references public.house_options (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, child_id)
);
create table public.houses (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null unique references public.classes (id) on delete cascade,
  name text not null,
  color text not null,
  power text not null,
  motto text not null default '',
  created_at timestamptz not null default now()
);
create unique index houses_name_idx on public.houses (lower(name));
alter table public.house_options enable row level security;
alter table public.house_votes enable row level security;
alter table public.houses enable row level security;
revoke all on public.house_options, public.house_votes, public.houses from anon, authenticated;

insert into public.app_settings (key, value) values
  ('house_rules', '{"points_per_correct": 2, "weekly_cap": 80, "min_members": 3}') on conflict (key) do nothing;

-- Verified learning credit per hero per school week, capped.
create function public.house_weekly() returns table (child_id uuid, week date, pts int)
language sql stable security definer set search_path = public as $$
  with raw as (
    select h.child_id, school_week(h.answered_at) w,
           count(*) filter (where h.correct) * (setting('house_rules')->>'points_per_correct')::bigint p
      from question_history h where h.answered_at is not null group by 1, 2
    union all
    select s.child_id, school_week(s.created_at), s.correct * (setting('house_rules')->>'points_per_correct')::bigint from class_submissions s)
  select r.child_id, r.w, least(sum(r.p), (setting('house_rules')->>'weekly_cap')::bigint)::int from raw r group by r.child_id, r.w
$$;

create function public.house_clean(p_text text, p_max int, p_name boolean) returns text
language plpgsql stable security definer set search_path = public as $$
declare v text := regexp_replace(trim(coalesce(p_text, '')), '\s+', ' ', 'g');
begin
  if p_name then
    if v !~ '^[A-Za-z][A-Za-z ''-]{1,23}$' then raise exception 'house names are 2 to 24 letters'; end if;
  elsif v !~ '^[A-Za-z0-9 ,.!''-]{0,40}$' then
    raise exception 'mottos use letters, numbers and simple punctuation';
  end if;
  if char_length(v) > p_max then raise exception 'too long'; end if;
  if chat_flagged(v) then raise exception 'pick different words'; end if;
  return v;
end $$;

-- A teacher puts two or three House identities up for a class vote.
create function public.house_propose(p_class uuid, p_options jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  o jsonb;
  i int := 0;
  v_name text;
  v_names text[] := '{}';
begin
  if not teaches_class(p_class) then raise exception 'not your class'; end if;
  if exists (select 1 from houses where class_id = p_class) then raise exception 'this class already has a House'; end if;
  if exists (select 1 from house_options where class_id = p_class and closed_at is null) then raise exception 'a vote is already open'; end if;
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) not between 2 and 3 then raise exception 'propose 2 or 3 Houses'; end if;
  for o in select jsonb_array_elements(p_options) loop
    v_name := house_clean(o ->> 'name', 24, true);
    if lower(v_name) = any (v_names) then raise exception 'each House needs its own name'; end if;
    if exists (select 1 from houses where lower(name) = lower(v_name)) then raise exception 'another class already has a House with that name'; end if;
    v_names := v_names || lower(v_name);
    if coalesce(o ->> 'color', '') !~ '^#[0-9a-f]{6}$' then raise exception 'pick a colour'; end if;
    if coalesce(o ->> 'power', '') not in ('flame', 'storm', 'tide', 'frost', 'earth', 'light', 'star', 'wind') then raise exception 'pick a power'; end if;
    insert into house_options (class_id, idx, name, color, power, motto)
    values (p_class, i, v_name, o ->> 'color', o ->> 'power', house_clean(o ->> 'motto', 40, false))
    on conflict (class_id, idx) do update set name = excluded.name, color = excluded.color, power = excluded.power, motto = excluded.motto, closed_at = null;
    i := i + 1;
  end loop;
end $$;

create function public.house_vote(p_option bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_class uuid;
begin
  select class_id into v_class from class_members where child_id = me;
  if v_class is null then raise exception 'join a class first'; end if;
  if not exists (select 1 from house_options where id = p_option and class_id = v_class and closed_at is null) then raise exception 'that vote is not open'; end if;
  insert into house_votes (class_id, child_id, option_id) values (v_class, me, p_option)
  on conflict (class_id, child_id) do update set option_id = excluded.option_id;
end $$;

-- The teacher closes the vote. The most votes wins; a tie goes to the House proposed first.
create function public.house_close_vote(p_class uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  w house_options;
  v_id uuid;
begin
  if not teaches_class(p_class) then raise exception 'not your class'; end if;
  if exists (select 1 from houses where class_id = p_class) then raise exception 'this class already has a House'; end if;
  select o.* into w from house_options o left join house_votes v on v.option_id = o.id
   where o.class_id = p_class and o.closed_at is null
   group by o.id order by count(v.child_id) desc, o.idx limit 1;
  if w.id is null then raise exception 'there is no open vote'; end if;
  if not exists (select 1 from house_votes where class_id = p_class) then raise exception 'wait for at least one vote'; end if;
  insert into houses (class_id, name, color, power, motto) values (p_class, w.name, w.color, w.power, w.motto) returning id into v_id;
  update house_options set closed_at = now() where class_id = p_class and closed_at is null;
  return v_id;
end $$;

create function public.house_json(h houses) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', h.id, 'name', h.name, 'color', h.color, 'power', h.power, 'motto', h.motto)
$$;

-- What a hero sees about their own House: the vote while it is open, then the House.
create function public.house_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_class uuid;
  v_house houses;
  v_rules jsonb := setting('house_rules');
  v_mine int;
begin
  select class_id into v_class from class_members where child_id = me;
  select coalesce(sum(pts), 0) into v_mine from house_weekly() w where w.child_id = me and w.week = school_week();
  if v_class is null then return jsonb_build_object('state', 'no_class', 'week_points', v_mine, 'cap', (v_rules->>'weekly_cap')::int); end if;
  select * into v_house from houses where class_id = v_class;
  if v_house.id is not null then
    return jsonb_build_object('state', 'active', 'house', house_json(v_house), 'week_points', v_mine, 'cap', (v_rules->>'weekly_cap')::int,
      'members', (select count(*) from class_members where class_id = v_class),
      'class_name', (select name from classes where id = v_class));
  end if;
  if exists (select 1 from house_options where class_id = v_class and closed_at is null) then
    return jsonb_build_object('state', 'voting', 'week_points', v_mine, 'cap', (v_rules->>'weekly_cap')::int,
      'options', (select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'color', o.color, 'power', o.power, 'motto', o.motto) order by o.idx)
                    from house_options o where o.class_id = v_class and o.closed_at is null),
      'my_vote', (select option_id from house_votes where class_id = v_class and child_id = me));
  end if;
  return jsonb_build_object('state', 'none', 'week_points', v_mine, 'cap', (v_rules->>'weekly_cap')::int);
end $$;

create function public.house_teacher_view(p_class uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_house houses;
begin
  if not teaches_class(p_class) then raise exception 'not your class'; end if;
  select * into v_house from houses where class_id = p_class;
  if v_house.id is not null then return jsonb_build_object('state', 'active', 'house', house_json(v_house)); end if;
  if exists (select 1 from house_options where class_id = p_class and closed_at is null) then
    return jsonb_build_object('state', 'voting',
      'members', (select count(*) from class_members where class_id = p_class),
      'voted', (select count(*) from house_votes where class_id = p_class),
      'options', (select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'color', o.color, 'power', o.power, 'motto', o.motto,
                    'votes', (select count(*) from house_votes v where v.option_id = o.id)) order by o.idx)
                    from house_options o where o.class_id = p_class and o.closed_at is null));
  end if;
  return jsonb_build_object('state', 'none', 'members', (select count(*) from class_members where class_id = p_class));
end $$;

-- Houses across both grades, plus this grade's top heroes. Names only: no codes or identities.
create function public.leaderboard() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_grade smallint;
  v_class uuid;
  v_week date := school_week();
  v_min int := (setting('house_rules')->>'min_members')::int;
begin
  select grade into v_grade from heroes where id = me;
  select class_id into v_class from class_members where child_id = me;
  return jsonb_build_object(
    'min_members', v_min,
    'houses', coalesce((
      with m as (select class_id, count(*) n from class_members group by class_id),
      s as (select cm.class_id, w.week, sum(w.pts) t from class_members cm join house_weekly() w on w.child_id = cm.child_id group by 1, 2),
      sc as (select h.id, h.class_id, h.name, h.color, h.power, h.motto, c.grade, m.n,
                    round(coalesce(sum(s.t) filter (where s.week = v_week), 0)::numeric / m.n, 1) wk,
                    round(coalesce(sum(s.t), 0)::numeric / m.n, 1) season
               from houses h join classes c on c.id = h.class_id join m on m.class_id = h.class_id left join s on s.class_id = h.class_id
              where m.n >= v_min group by h.id, h.class_id, h.name, h.color, h.power, h.motto, c.grade, m.n),
      rk as (select sc.*, rank() over (order by wk desc) rw, rank() over (order by season desc) rs from sc)
      select jsonb_agg(jsonb_build_object('name', name, 'color', color, 'power', power, 'motto', motto, 'grade', grade, 'members', n,
                'week', wk, 'season', season, 'rank_week', rw, 'rank_season', rs, 'mine', class_id = v_class) order by season desc, name)
        from rk), '[]'::jsonb),
    'heroes', coalesce((
      with p as (select h.id, h.display_name, h.starter_hero,
                        coalesce(sum(w.pts) filter (where w.week = v_week), 0) wk, coalesce(sum(w.pts), 0) season
                   from heroes h left join house_weekly() w on w.child_id = h.id where h.grade = v_grade group by h.id),
      r as (select *, rank() over (order by season desc) rs, rank() over (order by wk desc) rw from p where season > 0)
      select jsonb_agg(jsonb_build_object('name', display_name, 'starter', starter_hero, 'week', wk, 'season', season,
                'rank_week', rw, 'rank_season', rs, 'me', id = me) order by season desc, display_name)
        from (select * from r where rs <= 10 or rw <= 10 or id = me) x), '[]'::jsonb));
end $$;

revoke execute on function public.house_weekly(), public.house_clean(text, int, boolean), public.house_json(houses) from public, anon, authenticated;
revoke execute on function public.house_propose(uuid, jsonb), public.house_vote(bigint), public.house_close_vote(uuid), public.house_state(),
  public.house_teacher_view(uuid), public.leaderboard() from public, anon;
grant execute on function public.house_propose(uuid, jsonb), public.house_vote(bigint), public.house_close_vote(uuid), public.house_state(),
  public.house_teacher_view(uuid), public.leaderboard() to authenticated;
