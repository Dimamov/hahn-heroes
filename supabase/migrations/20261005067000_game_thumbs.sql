-- Thumbs-up on games, and streak counts in the monthly report. A thumb is kept per hero and game and can be taken back
-- (nothing is removed, the row just says up or not). The report shows only totals, never names.
create table public.game_thumbs (
  child uuid not null references public.heroes (id) on delete cascade,
  game text not null check (game ~ '^[a-z0-9-]{1,30}$'),
  up boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (child, game)
);
alter table public.game_thumbs enable row level security;
revoke all on public.game_thumbs from anon, authenticated;

create function public.game_thumb_set(p_game text, p_up boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  if p_game is null or p_game !~ '^[a-z0-9-]{1,30}$' then raise exception 'that is not a game'; end if;
  insert into game_thumbs (child, game, up) values (me, p_game, coalesce(p_up, false))
  on conflict (child, game) do update set up = excluded.up, updated_at = now();
end $$;

create function public.my_game_thumbs() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(game order by game), '[]'::jsonb) from game_thumbs where child = me_hero() and up
$$;
revoke execute on function public.game_thumb_set(text, boolean), public.my_game_thumbs() from public, anon;
grant execute on function public.game_thumb_set(text, boolean), public.my_game_thumbs() to authenticated;

-- One school month of counts. p_back = 0 is this month, 1 is last month. No names, only totals.
create or replace function public.sensei_usage_report(p_back int default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := setting('school_timezone') #>> '{}';
  v_start date := (date_trunc('month', school_date()) - make_interval(months => greatest(0, least(p_back, 12))))::date;
  v_end date := (v_start + interval '1 month')::date;
  v_pstart date := (v_start - interval '1 month')::date;
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  return jsonb_build_object(
    'month', v_start,
    'since', (select min(day) from screen_use),
    'heroes_total', (select count(*) from heroes),
    'active_kids', (select count(distinct child) from screen_use where day >= v_start and day < v_end),
    'hidden', hidden_games(),
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object('screen', s.screen, 'opens', s.opens, 'players', s.players, 'came_back', s.came_back,
               'minutes', s.minutes, 'prev_opens', coalesce(p.opens, 0)) order by s.opens desc)
      from (select screen, sum(opens)::int opens, count(distinct child)::int players, sum(pings)::int minutes,
                   (select count(*) from (select u2.child from screen_use u2 where u2.screen = u.screen and u2.day >= v_start and u2.day < v_end
                                          and u2.opens > 0 group by u2.child having count(distinct u2.day) >= 2) r)::int came_back
              from screen_use u where day >= v_start and day < v_end group by screen) s
      left join (select screen, sum(opens)::int opens from screen_use where day >= v_pstart and day < v_start group by screen) p on p.screen = s.screen), '[]'::jsonb),
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object('week', w.week, 'kids', w.kids) order by w.week)
      from (select date_trunc('week', day::timestamp)::date week, count(distinct child)::int kids
              from screen_use where day >= v_start and day < v_end group by 1) w), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object('hour', hh, 'minutes', coalesce(c.m, 0)) order by hh)
      from generate_series(0, 23) hh
      left join (select hour, sum(pings)::int m from traffic_pings where role = 'hero' and day >= v_start and day < v_end group by hour) c on c.hour = hh), '[]'::jsonb),
    'thumbs', coalesce((select jsonb_object_agg(game, n) from (select game, count(*)::int n from game_thumbs where up group by game) t), '{}'::jsonb),
    'streaks', (select jsonb_build_object(
        'one', count(*) filter (where d = 1), 'few', count(*) filter (where d between 2 and 3),
        'many', count(*) filter (where d between 4 and 6), 'daily', count(*) filter (where d >= 7))
      from (select child, count(distinct day)::int d from screen_use where day >= v_start and day < v_end group by child) x),
    'run3', (select count(*)::int from (select child from (
        select child, day - (row_number() over (partition by child order by day))::int g
          from (select distinct child, day from screen_use where day >= v_start and day < v_end) dd) q
       group by child, g having count(*) >= 3) z),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object('subject', sj, 'answered', n, 'correct', ok) order by sj)
      from (select q.subject::text sj, count(*)::int n, count(*) filter (where h.correct)::int ok
              from question_history h join questions q on q.id = h.question_id
             where h.answered_at is not null and (h.answered_at at time zone v_tz)::date >= v_start and (h.answered_at at time zone v_tz)::date < v_end
             group by q.subject) t), '[]'::jsonb));
end $$;


revoke execute on function public.sensei_usage_report(int) from public, anon;
grant execute on function public.sensei_usage_report(int) to authenticated;
