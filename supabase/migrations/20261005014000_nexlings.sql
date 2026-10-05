-- Nexlings: companions that grow with a hero's earned points. Names and art are working versions.
-- Growth = the coins a hero has earned since adopting (spending never shrinks it), with a 1.5x bonus on
-- one source per type, so each type is useful for a different kind of play and no source can be farmed:
-- the coins themselves are already capped per source.
create table public.nexling_types (
  id text primary key,
  name text not null,
  icon text not null,
  element text not null,
  bonus_source public.reward_source not null,
  blurb text not null
);
insert into public.nexling_types (id, name, icon, element, bonus_source, blurb) values
  ('emberling', 'Emberling', '🔥', 'Flame', 'learning', 'Loves a good brain workout. Grows extra from Learn practice.'),
  ('zephling', 'Zephling', '🌪️', 'Wind', 'game', 'Fast and playful. Grows extra from arcade games.'),
  ('tideling', 'Tideling', '🌊', 'Tide', 'class_mission', 'Calm and focused. Grows extra from class missions.'),
  ('mossling', 'Mossling', '🌿', 'Earth', 'home_mission', 'Helpful at home. Grows extra from home missions.'),
  ('frostling', 'Frostling', '❄️', 'Frost', 'streak', 'Keeps its cool. Grows extra from streaks.'),
  ('sparkling', 'Sparkling', '⚡', 'Storm', 'daily', 'Always on time. Grows extra from the daily check-in.'),
  ('glimmerling', 'Glimmerling', '✨', 'Light', 'event', 'Shines at big moments. Grows extra from events.');

create table public.nexlings (
  hero_id uuid primary key references public.heroes (id) on delete cascade,
  type_id text not null references public.nexling_types (id),
  nickname text not null,
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  adopted_at timestamptz not null default now()
);
alter table public.nexling_types enable row level security;
alter table public.nexlings enable row level security;
revoke all on public.nexling_types, public.nexlings from anon, authenticated;

insert into public.app_settings (key, value) values ('nexling_stages', '[0, 100, 400, 1000]')
on conflict (key) do nothing;

create function public.nexling_growth(p_hero uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(floor(sum(case when l.source = t.bonus_source then l.amount * 1.5 else l.amount end)), 0)::int
    from nexlings n
    join nexling_types t on t.id = n.type_id
    join ledger_entries l on l.child_id = n.hero_id and l.currency = 'coins' and l.amount > 0 and l.created_at >= n.adopted_at
   where n.hero_id = p_hero
$$;

create function public.nexling_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  n nexlings;
  v_stages jsonb := setting('nexling_stages');
  v_growth int;
  v_stage int;
begin
  select * into n from nexlings where hero_id = me;
  if n.hero_id is not null then
    v_growth := nexling_growth(me);
    select count(*) into v_stage from jsonb_array_elements_text(v_stages) s where s::int <= v_growth;
  end if;
  return jsonb_build_object(
    'stages', v_stages,
    'types', (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'icon', icon, 'element', element, 'bonus', bonus_source, 'blurb', blurb) order by name) from nexling_types),
    'mine', case when n.hero_id is null then null else jsonb_build_object(
      'type', n.type_id, 'nickname', n.nickname, 'color', n.color, 'growth', v_growth, 'stage', v_stage,
      'next_at', (select s::int from jsonb_array_elements_text(v_stages) s where s::int > v_growth order by s::int limit 1)) end);
end $$;

create function public.nexling_check(p_nickname text, p_color text) returns text
language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  v := house_clean(p_nickname, 16, true);
  if p_color not in ('#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899') then raise exception 'pick a colour'; end if;
  return v;
end $$;

-- Pick a Nexling. Choosing a different one starts its growth from zero.
create function public.nexling_adopt(p_type text, p_nickname text, p_color text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v text := nexling_check(p_nickname, p_color);
begin
  if not exists (select 1 from nexling_types where id = p_type) then raise exception 'no such Nexling'; end if;
  insert into nexlings (hero_id, type_id, nickname, color) values (me, p_type, v, p_color)
  on conflict (hero_id) do update set
    nickname = excluded.nickname, color = excluded.color,
    type_id = excluded.type_id,
    adopted_at = case when nexlings.type_id = excluded.type_id then nexlings.adopted_at else now() end;
end $$;

revoke execute on function public.nexling_growth(uuid), public.nexling_check(text, text) from public, anon, authenticated;
revoke execute on function public.nexling_state(), public.nexling_adopt(text, text, text) from public, anon;
grant execute on function public.nexling_state(), public.nexling_adopt(text, text, text) to authenticated;
