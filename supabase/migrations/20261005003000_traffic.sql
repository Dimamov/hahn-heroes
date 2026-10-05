-- Active players and traffic for the Sensei. The app sends a small "I'm here" ping about once a
-- minute while it is open. Nothing is ever deleted: rows are only added or updated.

create table public.presence (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('hero', 'parent', 'teacher', 'sensei')),
  screen text not null default 'home',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index presence_last_seen_idx on public.presence (last_seen);

-- One row per person per school-time hour. pings is roughly "minutes active" in that hour.
create table public.traffic_pings (
  day date not null,
  hour smallint not null check (hour between 0 and 23),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('hero', 'parent', 'teacher', 'sensei')),
  pings int not null default 1,
  primary key (day, hour, user_id)
);
create index traffic_pings_user_idx on public.traffic_pings (user_id);

alter table public.presence enable row level security;
alter table public.traffic_pings enable row level security;
revoke all on public.presence, public.traffic_pings from anon, authenticated;

create function public.ping(p_screen text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_screen text := left(coalesce(p_screen, 'home'), 24);
  v_local timestamp := now() at time zone (public.setting('school_timezone') #>> '{}');
  v_last presence;
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  if v_screen !~ '^[a-z0-9:_-]+$' then v_screen := 'other'; end if;
  if exists (select 1 from heroes where id = v_uid) then v_role := 'hero';
  else select role into v_role from adults where id = v_uid; end if;
  if v_role is null then return; end if;

  select * into v_last from presence where user_id = v_uid;
  -- Same screen within 45 seconds: nothing new to record.
  if v_last.user_id is not null and v_last.screen = v_screen and v_last.last_seen > now() - interval '45 seconds' then
    return;
  end if;

  insert into presence (user_id, role, screen) values (v_uid, v_role, v_screen)
  on conflict (user_id) do update set screen = excluded.screen, last_seen = now(), role = excluded.role;

  insert into traffic_pings (day, hour, user_id, role) values (v_local::date, extract(hour from v_local)::smallint, v_uid, v_role)
  on conflict (day, hour, user_id) do update set pings = traffic_pings.pings + 1;
end $$;

create function public.sensei_traffic() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public.school_date();
  v_total_heroes int;
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  select count(*) into v_total_heroes from heroes;
  return jsonb_build_object(
    'total_heroes', v_total_heroes,
    'now_heroes', (select count(*) from presence where role = 'hero' and last_seen > now() - interval '5 minutes'),
    'now_adults', (select count(*) from presence where role in ('parent', 'teacher') and last_seen > now() - interval '5 minutes'),
    'today_heroes', (select count(distinct user_id) from traffic_pings where role = 'hero' and day = v_today),
    'week_heroes', (select count(distinct user_id) from traffic_pings where role = 'hero' and day > v_today - 7),
    'month_heroes', (select count(distinct user_id) from traffic_pings where role = 'hero' and day > v_today - 30),
    'active', coalesce((
      select jsonb_agg(jsonb_build_object('name', h.display_name, 'grade', h.grade, 'screen', p.screen,
               'seconds_ago', extract(epoch from now() - p.last_seen)::int) order by p.last_seen desc)
      from (select * from presence where role = 'hero' and last_seen > now() - interval '5 minutes' order by last_seen desc limit 40) p
      join heroes h on h.id = p.user_id), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'heroes', coalesce(t.heroes, 0), 'adults', coalesce(t.adults, 0),
               'minutes', coalesce(t.minutes, 0), 'new_heroes', coalesce(n.new_heroes, 0)) order by d.day)
      from generate_series(v_today - 13, v_today, interval '1 day') g(day_ts)
      cross join lateral (select g.day_ts::date as day) d
      left join (select day, count(distinct user_id) filter (where role = 'hero') heroes,
                        count(distinct user_id) filter (where role in ('parent', 'teacher')) adults,
                        sum(pings) filter (where role = 'hero') minutes
                 from traffic_pings where day > v_today - 14 group by day) t on t.day = d.day
      left join (select public.school_date(created_at) as day, count(*) new_heroes from heroes group by 1) n on n.day = d.day), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object('hour', hh, 'heroes', coalesce(c.heroes, 0)) order by hh)
      from generate_series(0, 23) hh
      left join (select hour, count(distinct user_id) heroes from traffic_pings where role = 'hero' and day = v_today group by hour) c on c.hour = hh), '[]'::jsonb),
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object('screen', screen, 'count', n) order by n desc)
      from (select screen, count(*) n from presence where role = 'hero' and last_seen > now() - interval '5 minutes' group by screen) s), '[]'::jsonb));
end $$;

revoke execute on function public.ping(text), public.sensei_traffic() from public, anon;
grant execute on function public.ping(text), public.sensei_traffic() to authenticated;
