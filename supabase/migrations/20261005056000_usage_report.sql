-- Monthly usage report for the Sensei: which games and features kids use, so unloved games can be hidden.
-- Counts only. The report never shows a name. Each screen visit and each minute on it is already seen by ping();
-- this keeps a per-day tally of it. Games can be hidden (and shown again) without deleting anything.
create table public.screen_use (
  day date not null,
  child uuid not null references public.heroes (id) on delete cascade,
  screen text not null,
  opens int not null default 0,
  pings int not null default 0,
  primary key (day, child, screen)
);
create index screen_use_screen_idx on public.screen_use (screen, day);
alter table public.screen_use enable row level security;
revoke all on public.screen_use from anon, authenticated;

insert into public.app_settings (key, value) values ('hidden_games', '[]') on conflict (key) do nothing;

-- ping() as before, plus the per-day tally for heroes.
create or replace function public.ping(p_screen text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_screen text := left(coalesce(p_screen, 'home'), 24);
  v_local timestamp := now() at time zone (public.setting('school_timezone') #>> '{}');
  v_last presence;
  v_open boolean;
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  if v_screen !~ '^[a-z0-9:_-]+$' then v_screen := 'other'; end if;
  if exists (select 1 from heroes where id = v_uid) then v_role := 'hero';
  else select role into v_role from adults where id = v_uid; end if;
  if v_role is null then return; end if;

  select * into v_last from presence where user_id = v_uid;
  if v_last.user_id is not null and v_last.screen = v_screen and v_last.last_seen > now() - interval '45 seconds' then
    return;
  end if;
  v_open := v_last.user_id is null or v_last.screen <> v_screen or v_last.last_seen < now() - interval '5 minutes';

  insert into presence (user_id, role, screen) values (v_uid, v_role, v_screen)
  on conflict (user_id) do update set screen = excluded.screen, last_seen = now(), role = excluded.role;

  insert into traffic_pings (day, hour, user_id, role) values (v_local::date, extract(hour from v_local)::smallint, v_uid, v_role)
  on conflict (day, hour, user_id) do update set pings = traffic_pings.pings + 1;

  if v_role = 'hero' then
    insert into screen_use (day, child, screen, opens, pings)
    values (v_local::date,
            v_uid,
            case when v_screen like 'game:%' or v_screen like 'practice:%' then v_screen else split_part(v_screen, ':', 1) end,
            case when v_open then 1 else 0 end, 1)
    on conflict (day, child, screen) do update set opens = screen_use.opens + excluded.opens, pings = screen_use.pings + 1;
  end if;
end $$;

create function public.hidden_games() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(setting('hidden_games'), '[]'::jsonb)
$$;

-- Hide a game from the Arcade, or show it again. Nothing is deleted.
create function public.sensei_hide_game(p_id text, p_hidden boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  if p_id !~ '^[a-z0-9-]{1,30}$' then raise exception 'that is not a game'; end if;
  update app_settings set updated_at = now(), value = case
    when p_hidden then (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from jsonb_array_elements_text(value || to_jsonb(p_id)) x)
    else (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements_text(value) x where x <> p_id) end
   where key = 'hidden_games';
end $$;

-- One school month of counts. p_back = 0 is this month, 1 is last month. No names, only totals.
create function public.sensei_usage_report(p_back int default 0) returns jsonb
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
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object('subject', sj, 'answered', n, 'correct', ok) order by sj)
      from (select q.subject::text sj, count(*)::int n, count(*) filter (where h.correct)::int ok
              from question_history h join questions q on q.id = h.question_id
             where h.answered_at is not null and (h.answered_at at time zone v_tz)::date >= v_start and (h.answered_at at time zone v_tz)::date < v_end
             group by q.subject) t), '[]'::jsonb));
end $$;

revoke execute on function public.ping(text), public.hidden_games(), public.sensei_hide_game(text, boolean), public.sensei_usage_report(int) from public, anon;
grant execute on function public.ping(text), public.hidden_games(), public.sensei_hide_game(text, boolean), public.sensei_usage_report(int) to authenticated;
