-- Weekly room contest: a theme each week, heroes enter their dorm room, and vote for rooms made by
-- their own squad mates and House (class) mates. No text, no votes for yourself, one vote a week.
-- Entering and voting earn a few points; last week's top room in your circle can claim a prize.
create table public.contest_entries (
  week date not null,
  hero_id uuid not null references public.heroes (id) on delete cascade,
  entered_at timestamptz not null default now(),
  primary key (week, hero_id)
);
create table public.contest_votes (
  week date not null,
  voter uuid not null references public.heroes (id) on delete cascade,
  entry uuid not null references public.heroes (id) on delete cascade,
  primary key (week, voter),
  check (voter <> entry)
);
create table public.contest_claims (
  week date not null,
  hero_id uuid not null references public.heroes (id) on delete cascade,
  primary key (week, hero_id)
);
alter table public.contest_entries enable row level security;
alter table public.contest_votes enable row level security;
alter table public.contest_claims enable row level security;
revoke all on public.contest_entries, public.contest_votes, public.contest_claims from anon, authenticated;

create function public.contest_theme(p_week date) returns text
language sql immutable set search_path = public as $$
  select (array['Coziest room', 'Coolest room', 'Most colourful room', 'Most magical room', 'Best room for studying', 'Most Nexus-y room'])
         [1 + ((p_week - date '2026-01-05') / 7) % 6]
$$;

-- Squad mates and House (class) mates of a hero. Never the hero themselves.
create function public.contest_circle(p_hero uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select m2.child_id from squad_members m1 join squads s on s.id = m1.squad_id and s.disbanded_at is null
    join squad_members m2 on m2.squad_id = m1.squad_id and m2.status = 'member'
   where m1.child_id = p_hero and m1.status = 'member' and m2.child_id <> p_hero
  union
  select c2.child_id from class_members c1 join class_members c2 on c2.class_id = c1.class_id
   where c1.child_id = p_hero and c2.child_id <> p_hero
$$;

create function public.contest_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_week date := school_week(now());
  v_last date := school_week(now()) - 7;
  v_my_last int; v_best int;
begin
  select count(*) into v_my_last from contest_votes where week = v_last and entry = me;
  select coalesce(max(n), 0) into v_best from (
    select count(*) n from contest_votes v where v.week = v_last and v.entry in (select contest_circle(me)) group by v.entry) t;
  return jsonb_build_object(
    'theme', contest_theme(v_week),
    'entered', exists (select 1 from contest_entries where week = v_week and hero_id = me),
    'has_room', coalesce((select jsonb_array_length(layout) > 0 from hero_rooms where hero_id = me), false),
    'voted', exists (select 1 from contest_votes where week = v_week and voter = me),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object('hero', h.id, 'name', h.display_name, 'starter', h.starter_hero,
               'layout', coalesce(r.layout, '[]'::jsonb), 'mine_vote', exists (select 1 from contest_votes v where v.week = v_week and v.voter = me and v.entry = h.id))
               order by md5(h.id::text || v_week::text))
        from contest_entries e join heroes h on h.id = e.hero_id left join hero_rooms r on r.hero_id = h.id
       where e.week = v_week and e.hero_id in (select contest_circle(me))), '[]'::jsonb),
    'last', jsonb_build_object('theme', contest_theme(v_last),
      'entered', exists (select 1 from contest_entries where week = v_last and hero_id = me),
      'votes', v_my_last,
      'won', v_my_last > 0 and v_my_last >= v_best,
      'claimed', exists (select 1 from contest_claims where week = v_last and hero_id = me)));
end $$;

create function public.contest_enter() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero(); v_week date := school_week(now());
begin
  if not coalesce((select jsonb_array_length(layout) > 0 from hero_rooms where hero_id = me), false) then raise exception 'decorate your room first'; end if;
  insert into contest_entries (week, hero_id) values (v_week, me) on conflict do nothing;
  perform award(me, 'coins', 3, 'event', 'Room contest entry', 'contest-enter:' || v_week);
end $$;

create function public.contest_vote(p_hero uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero(); v_week date := school_week(now());
begin
  if not exists (select 1 from contest_entries where week = v_week and hero_id = p_hero) or not (p_hero in (select contest_circle(me))) then
    raise exception 'you can only vote for your squad or House';
  end if;
  if exists (select 1 from contest_votes where week = v_week and voter = me) then raise exception 'you already voted this week'; end if;
  insert into contest_votes (week, voter, entry) values (v_week, me, p_hero);
  perform award(me, 'coins', 2, 'event', 'Room contest vote', 'contest-vote:' || v_week);
end $$;

create function public.contest_claim() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero(); v_last date := school_week(now()) - 7; s jsonb := contest_state();
begin
  if not (s->'last'->>'won')::boolean then return jsonb_build_object('ok', false); end if;
  if (s->'last'->>'claimed')::boolean then return jsonb_build_object('ok', false); end if;
  insert into contest_claims (week, hero_id) values (v_last, me);
  perform award(me, 'coins', 10, 'event', 'Room contest winner', 'contest-win:' || v_last);
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.contest_theme(date), public.contest_circle(uuid) from public, anon, authenticated;
revoke execute on function public.contest_state(), public.contest_enter(), public.contest_vote(uuid), public.contest_claim() from public, anon;
grant execute on function public.contest_state(), public.contest_enter(), public.contest_vote(uuid), public.contest_claim() to authenticated;
