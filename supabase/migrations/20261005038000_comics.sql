-- Build-a-comic: three panels, each a hero, a scene, a pose and one speech line picked from a fixed
-- list (no typing). A hero can share a comic with their squad; squad mates can read it.
create table public.comics (
  id bigint generated always as identity primary key,
  maker uuid not null references public.heroes (id) on delete cascade,
  panels jsonb not null check (jsonb_typeof(panels) = 'array' and jsonb_array_length(panels) = 3),
  squad_id uuid references public.squads (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index comics_maker_idx on public.comics (maker) where deleted_at is null;
create index comics_squad_idx on public.comics (squad_id) where deleted_at is null;
alter table public.comics enable row level security;
revoke all on public.comics from anon, authenticated;

create function public.comic_lists() returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'heroes', '["ana","isabella","anayah","luna","kacee","g06","g07","g08","g09","g10","b01","b02","b03","b04","b05","b06","b07","b08","b09","b10"]'::jsonb,
    'scenes', '["hall","forest","space","castle","beach","city"]'::jsonb,
    'poses', '["stand","cheer","cool","power"]'::jsonb,
    'lines', '["Let''s go!","Watch out!","I found it!","Nexus power!","Together we win!","That was close!","Look over there!","Awesome!","Oh no!","We did it!","Follow me!","Great idea!","Help is here!","Time to learn!","Level up!","Ready?"]'::jsonb)
$$;

create function public.comic_valid(p_panels jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare p jsonb; l jsonb := comic_lists();
begin
  if jsonb_typeof(p_panels) <> 'array' or jsonb_array_length(p_panels) <> 3 then return false; end if;
  for p in select jsonb_array_elements(p_panels) loop
    if jsonb_typeof(p) <> 'object' or not (l->'heroes' ? (p->>'hero')) or not (l->'scenes' ? (p->>'scene'))
       or not (l->'poses' ? (p->>'pose')) or not (l->'lines' ? (p->>'line')) then return false; end if;
  end loop;
  return true;
end $$;

create function public.comic_make(p_panels jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_id bigint;
begin
  if not comic_valid(p_panels) then raise exception 'pick from the lists'; end if;
  if (select count(*) from comics where maker = me and deleted_at is null) >= 10 then raise exception 'your comic shelf is full'; end if;
  insert into comics (maker, panels) values (me, (select jsonb_agg(jsonb_build_object('hero', e->>'hero', 'scene', e->>'scene', 'pose', e->>'pose', 'line', e->>'line')) from jsonb_array_elements(p_panels) e))
  returning id into v_id;
  return v_id;
end $$;

create function public.comic_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'panels', c.panels, 'shared', c.squad_id is not null) order by c.id desc)
                     from comics c where c.maker = me and c.deleted_at is null), '[]'::jsonb);
end $$;

-- Comics your squad mates have shared.
create function public.comic_squad() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_squad uuid;
begin
  select s.id into v_squad from squads s join squad_members m on m.squad_id = s.id
   where m.child_id = me and m.status = 'member' and s.disbanded_at is null;
  if v_squad is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'panels', c.panels, 'maker', h.display_name) order by c.id desc)
                     from comics c join heroes h on h.id = c.maker
                    where c.squad_id = v_squad and c.maker <> me and c.deleted_at is null), '[]'::jsonb);
end $$;

create function public.comic_share(p_id bigint, p_share boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_squad uuid;
begin
  if p_share then
    select s.id into v_squad from squads s join squad_members m on m.squad_id = s.id
     where m.child_id = me and m.status = 'member' and s.disbanded_at is null;
    if v_squad is null then raise exception 'join a squad to share'; end if;
  end if;
  update comics set squad_id = v_squad where id = p_id and maker = me and deleted_at is null;
  if not found then raise exception 'that is not your comic'; end if;
end $$;

create function public.comic_delete(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update comics set deleted_at = now(), squad_id = null where id = p_id and maker = me_hero() and deleted_at is null;
  if not found then raise exception 'that is not your comic'; end if;
end $$;

revoke execute on function public.comic_lists(), public.comic_valid(jsonb) from public, anon, authenticated;
revoke execute on function public.comic_make(jsonb), public.comic_list(), public.comic_squad(), public.comic_share(bigint, boolean), public.comic_delete(bigint) from public, anon;
grant execute on function public.comic_make(jsonb), public.comic_list(), public.comic_squad(), public.comic_share(bigint, boolean), public.comic_delete(bigint) to authenticated;
