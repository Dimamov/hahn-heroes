-- Weekly secret: a sparkle is hidden on one screen each week. Every hero who finds it earns a few
-- points, and the first squad to find it wins a card for every member. The Sensei can choose the
-- place, hint and card; otherwise the week picks them automatically.
create table public.secret_hunts (
  week date primary key,
  place text not null check (place in ('learn', 'arcade', 'cards', 'house', 'hero', 'room', 'nexlings', 'squad', 'quest', 'profile')),
  hint text not null check (char_length(hint) between 1 and 120),
  card_id text not null references public.card_defs (id)
);
create table public.secret_finds (
  week date not null references public.secret_hunts (week),
  hero_id uuid not null references public.heroes (id) on delete cascade,
  found_at timestamptz not null default now(),
  primary key (week, hero_id)
);
create table public.secret_winners (
  week date primary key references public.secret_hunts (week),
  squad_id uuid not null references public.squads (id) on delete cascade,
  found_by uuid not null references public.heroes (id) on delete cascade
);
create table public.secret_claims (
  week date not null references public.secret_hunts (week),
  hero_id uuid not null references public.heroes (id) on delete cascade,
  primary key (week, hero_id)
);
alter table public.secret_hunts enable row level security;
alter table public.secret_finds enable row level security;
alter table public.secret_winners enable row level security;
alter table public.secret_claims enable row level security;
revoke all on public.secret_hunts, public.secret_finds, public.secret_winners, public.secret_claims from anon, authenticated;

create function public.secret_hint_for(p_place text) returns text
language sql immutable set search_path = public as $$
  select case p_place
    when 'learn' then 'Look where heroes sharpen their minds.'
    when 'arcade' then 'Look where the games are kept.'
    when 'cards' then 'Look where the collectors spend their time.'
    when 'house' then 'Look where your class stands together.'
    when 'hero' then 'Look where your hero gets dressed.'
    when 'room' then 'Look inside a hero''s dorm room.'
    when 'nexlings' then 'Look where the little companions play.'
    when 'squad' then 'Look where friends team up.'
    when 'quest' then 'Look where the daily tasks live.'
    else 'Look at the page that is all about you.' end
$$;

create function public.secret_week_row() returns secret_hunts
language plpgsql security definer set search_path = public as $$
declare
  v_week date := school_week(now());
  r secret_hunts;
  n bigint := extract(epoch from v_week)::bigint / 604800;
  v_places text[] := array['learn', 'arcade', 'cards', 'house', 'hero', 'room', 'nexlings', 'squad', 'quest', 'profile'];
  v_place text;
  v_card text;
begin
  select * into r from secret_hunts where week = v_week;
  if r.week is not null then return r; end if;
  v_place := v_places[1 + (n * 7 % array_length(v_places, 1))::int];
  select id into v_card from card_defs where rarity in ('rare', 'epic') order by id offset (n % (select count(*) from card_defs where rarity in ('rare', 'epic')))::int limit 1;
  insert into secret_hunts (week, place, hint, card_id) values (v_week, v_place, secret_hint_for(v_place), v_card) on conflict (week) do nothing;
  select * into r from secret_hunts where week = v_week;
  return r;
end $$;

create function public.secret_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  w secret_hunts := secret_week_row();
  v_win secret_winners;
  v_mine uuid;
  c card_defs;
begin
  select * into v_win from secret_winners where week = w.week;
  select s.id into v_mine from squads s join squad_members m on m.squad_id = s.id
   where m.child_id = me and m.status = 'member' and s.disbanded_at is null;
  select * into c from card_defs where id = w.card_id;
  return jsonb_build_object(
    'place', w.place, 'hint', w.hint,
    'found', exists (select 1 from secret_finds where week = w.week and hero_id = me),
    'finders', (select count(*) from secret_finds where week = w.week),
    'won', v_win.week is not null,
    'winner_squad', (select name from squads where id = v_win.squad_id),
    'my_squad_won', v_win.week is not null and v_win.squad_id = v_mine,
    'claimed', exists (select 1 from secret_claims where week = w.week and hero_id = me),
    'card', jsonb_build_object('id', c.id, 'name', c.name, 'icon', c.icon));
end $$;

create function public.secret_find() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  w secret_hunts := secret_week_row();
  v_squad uuid;
  v_first boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended('secret:' || w.week::text, 5));
  if exists (select 1 from secret_finds where week = w.week and hero_id = me) then
    return jsonb_build_object('ok', false, 'reason', 'already_found');
  end if;
  insert into secret_finds (week, hero_id) values (w.week, me);
  select s.id into v_squad from squads s join squad_members m on m.squad_id = s.id
   where m.child_id = me and m.status = 'member' and s.disbanded_at is null;
  if v_squad is not null and not exists (select 1 from secret_winners where week = w.week) then
    insert into secret_winners (week, squad_id, found_by) values (w.week, v_squad, me);
    v_first := true;
  end if;
  perform award(me, 'coins', 5, 'event', 'Weekly secret', 'secret:' || w.week);
  return jsonb_build_object('ok', true, 'first_squad', v_first);
end $$;

-- Members of the winning squad collect the card once.
create function public.secret_claim() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  w secret_hunts := secret_week_row();
  v_win secret_winners;
begin
  select * into v_win from secret_winners where week = w.week;
  if v_win.week is null or not exists (
    select 1 from squad_members m join squads s on s.id = m.squad_id
     where m.squad_id = v_win.squad_id and m.child_id = me and m.status = 'member' and s.disbanded_at is null) then
    return jsonb_build_object('ok', false, 'reason', 'not_winner');
  end if;
  if exists (select 1 from secret_claims where week = w.week and hero_id = me) then
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;
  insert into secret_claims (week, hero_id) values (w.week, me);
  insert into hero_cards (hero_id, card_id, qty) values (me, w.card_id, 1)
  on conflict (hero_id, card_id) do update set qty = hero_cards.qty + 1;
  return jsonb_build_object('ok', true, 'card', w.card_id);
end $$;

create function public.sensei_secret_view() returns jsonb
language plpgsql security definer set search_path = public as $$
declare w secret_hunts := secret_week_row();
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do that'; end if;
  return jsonb_build_object('place', w.place, 'hint', w.hint, 'card', w.card_id,
    'finders', (select count(*) from secret_finds where week = w.week),
    'winner_squad', (select s.name from secret_winners x join squads s on s.id = x.squad_id where x.week = w.week));
end $$;

-- Change the place, hint or card until someone has found it.
create function public.sensei_secret_set(p_place text, p_hint text, p_card text) returns void
language plpgsql security definer set search_path = public as $$
declare w secret_hunts := secret_week_row();
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do that'; end if;
  if exists (select 1 from secret_finds where week = w.week) then raise exception 'someone already found this one'; end if;
  if not exists (select 1 from card_defs where id = p_card) then raise exception 'no such card'; end if;
  update secret_hunts set place = p_place, hint = left(trim(coalesce(nullif(trim(p_hint), ''), secret_hint_for(p_place))), 120), card_id = p_card where week = w.week;
end $$;

revoke execute on function public.secret_hint_for(text), public.secret_week_row() from public, anon, authenticated;
revoke execute on function public.secret_state(), public.secret_find(), public.secret_claim(),
  public.sensei_secret_view(), public.sensei_secret_set(text, text, text) from public, anon;
grant execute on function public.secret_state(), public.secret_find(), public.secret_claim(),
  public.sensei_secret_view(), public.sensei_secret_set(text, text, text) to authenticated;
