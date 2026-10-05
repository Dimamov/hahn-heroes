-- Trivia Night RSVP. The night itself (weekday and time) is the editable 'trivia_night' setting.
create table public.trivia_rsvps (
  event_date date not null,
  hero_id uuid not null references public.heroes (id) on delete cascade,
  going boolean not null,
  updated_at timestamptz not null default now(),
  primary key (event_date, hero_id)
);
alter table public.trivia_rsvps enable row level security;
revoke all on public.trivia_rsvps from anon, authenticated;

-- The next Trivia Night date: today if today is the night, otherwise the coming one.
create function public.trivia_next_date() returns date
language plpgsql stable set search_path = public as $$
declare
  v_dow int := array_position(array['sunday','monday','tuesday','wednesday','thursday','friday','saturday'],
                              setting('trivia_night') ->> 'weekday') - 1;
  v_today date := school_date(now());
begin
  return v_today + ((v_dow - extract(dow from v_today)::int + 7) % 7);
end $$;

create function public.trivia_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_date date := trivia_next_date();
  v_grade int;
begin
  select grade into v_grade from heroes where id = me;
  return jsonb_build_object(
    'date', v_date, 'time', setting('trivia_night') ->> 'time',
    'today', v_date = school_date(now()),
    'going', (select going from trivia_rsvps where event_date = v_date and hero_id = me),
    'going_count', (select count(*) from trivia_rsvps r join heroes h on h.id = r.hero_id
                     where r.event_date = v_date and r.going and h.grade = v_grade));
end $$;

create function public.trivia_rsvp(p_going boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  insert into trivia_rsvps (event_date, hero_id, going) values (trivia_next_date(), me, p_going)
  on conflict (event_date, hero_id) do update set going = excluded.going, updated_at = now();
  return trivia_state();
end $$;

-- Sensei: who is coming, per grade, and an attendance prize for everyone who said yes.
create function public.sensei_trivia_roster() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_date date := trivia_next_date();
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do that'; end if;
  return jsonb_build_object('date', v_date, 'time', setting('trivia_night') ->> 'time',
    'grades', coalesce((select jsonb_agg(jsonb_build_object('grade', g, 'going', n, 'names', names) order by g)
      from (select h.grade g, count(*) n, jsonb_agg(h.display_name order by h.display_name) names
              from trivia_rsvps r join heroes h on h.id = r.hero_id
             where r.event_date = v_date and r.going group by h.grade) s), '[]'::jsonb));
end $$;

create function public.sensei_trivia_prize(p_coins int) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_date date := school_date(now());
  r record;
  n int := 0;
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do that'; end if;
  if p_coins is null or p_coins not between 1 and 100 then raise exception 'pick 1 to 100 points'; end if;
  for r in select hero_id from trivia_rsvps where event_date = v_date and going loop
    if (award(r.hero_id, 'coins', p_coins, 'event', 'Trivia Night prize', 'trivia:' || v_date) ->> 'duplicate')::boolean is not true then
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke execute on function public.trivia_next_date(), public.trivia_state(), public.trivia_rsvp(boolean),
  public.sensei_trivia_roster(), public.sensei_trivia_prize(int) from public, anon;
grant execute on function public.trivia_state(), public.trivia_rsvp(boolean),
  public.sensei_trivia_roster(), public.sensei_trivia_prize(int) to authenticated;
