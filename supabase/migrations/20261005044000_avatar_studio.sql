-- Avatar studio: a hero mixes hair colour, makeup, an aura, an owned outfit and an owned accessory into
-- a "look", and can pin it to their profile. Friends, squad mates and House mates can like a pinned look
-- once. No comments, no text. A new look starts a fresh like count (likes belong to a look version).
create table public.hero_looks (
  hero_id uuid primary key references public.heroes (id) on delete cascade,
  hair text not null default 'brown',
  makeup text not null default 'none',
  aura text not null default 'none',
  outfit text references public.shop_items (id),
  accessory text references public.shop_items (id),
  pinned boolean not null default false,
  version int not null default 1,
  updated_at timestamptz not null default now()
);
create table public.look_likes (
  owner uuid not null references public.heroes (id) on delete cascade,
  liker uuid not null references public.heroes (id) on delete cascade,
  version int not null,
  created_at timestamptz not null default now(),
  primary key (owner, liker, version),
  check (owner <> liker)
);
alter table public.hero_looks enable row level security;
alter table public.look_likes enable row level security;
revoke all on public.hero_looks, public.look_likes from anon, authenticated;

create function public.look_lists() returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'hair', '["black","brown","blonde","red","pink","blue","purple","green"]'::jsonb,
    'makeup', '["none","sparkle","rosy","glam","neon","cool"]'::jsonb,
    'aura', '["none","flame","ice","star","rainbow","shadow","leaf"]'::jsonb)
$$;

-- Friends, squad mates and House mates of a hero.
create function public.look_circle(p_hero uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select contest_circle(p_hero)
  union
  select case when f.a = p_hero then f.b else f.a end from friendships f where f.status = 'accepted' and (f.a = p_hero or f.b = p_hero)
$$;

create function public.look_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := me_hero();
  l hero_looks;
begin
  select * into l from hero_looks where hero_id = me;
  return jsonb_build_object(
    'hair', coalesce(l.hair, 'brown'), 'makeup', coalesce(l.makeup, 'none'), 'aura', coalesce(l.aura, 'none'),
    'outfit', l.outfit, 'accessory', l.accessory, 'pinned', coalesce(l.pinned, false),
    'likes', (select count(*) from look_likes k where k.owner = me and k.version = coalesce(l.version, 1)),
    'outfits', coalesce((select jsonb_agg(i.item_id) from hero_items i join shop_items s on s.id = i.item_id where i.hero_id = me and s.kind = 'outfit'), '[]'::jsonb),
    'accessories', coalesce((select jsonb_agg(i.item_id) from hero_items i join shop_items s on s.id = i.item_id where i.hero_id = me and s.kind = 'accessory'), '[]'::jsonb));
end $$;

create function public.look_save(p_hair text, p_makeup text, p_aura text, p_outfit text, p_accessory text, p_pinned boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  lists jsonb := look_lists();
  l hero_looks;
begin
  if not (lists->'hair' ? p_hair) or not (lists->'makeup' ? p_makeup) or not (lists->'aura' ? p_aura) then raise exception 'pick from the lists'; end if;
  if p_outfit is not null and not exists (select 1 from hero_items i join shop_items s on s.id = i.item_id where i.hero_id = me and i.item_id = p_outfit and s.kind = 'outfit') then
    raise exception 'you do not own that outfit';
  end if;
  if p_accessory is not null and not exists (select 1 from hero_items i join shop_items s on s.id = i.item_id where i.hero_id = me and i.item_id = p_accessory and s.kind = 'accessory') then
    raise exception 'you do not own that accessory';
  end if;
  select * into l from hero_looks where hero_id = me;
  if l.hero_id is null then
    insert into hero_looks (hero_id, hair, makeup, aura, outfit, accessory, pinned) values (me, p_hair, p_makeup, p_aura, p_outfit, p_accessory, coalesce(p_pinned, false));
  else
    update hero_looks set hair = p_hair, makeup = p_makeup, aura = p_aura, outfit = p_outfit, accessory = p_accessory, pinned = coalesce(p_pinned, false), updated_at = now(),
           version = case when (l.hair, l.makeup, l.aura, l.outfit, l.accessory) is distinct from (p_hair, p_makeup, p_aura, p_outfit, p_accessory) then l.version + 1 else l.version end
     where hero_id = me;
  end if;
end $$;

-- Pinned looks from friends, squad mates and House mates, newest first.
create function public.look_gallery() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('hero', h.id, 'name', h.display_name, 'starter', h.starter_hero, 'hair', l.hair, 'makeup', l.makeup, 'aura', l.aura,
             'outfit', l.outfit, 'accessory', l.accessory,
             'likes', (select count(*) from look_likes k where k.owner = l.hero_id and k.version = l.version),
             'liked', exists (select 1 from look_likes k where k.owner = l.hero_id and k.version = l.version and k.liker = me)) order by l.updated_at desc)
      from (select * from hero_looks where pinned and hero_id in (select look_circle(me)) order by updated_at desc limit 30) l join heroes h on h.id = l.hero_id), '[]'::jsonb);
end $$;

create function public.look_like(p_hero uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero(); l hero_looks;
begin
  select * into l from hero_looks where hero_id = p_hero and pinned;
  if l.hero_id is null or not (p_hero in (select look_circle(me))) then raise exception 'you can only like looks from friends, your squad or your House'; end if;
  if exists (select 1 from look_likes where owner = p_hero and liker = me and version = l.version) then raise exception 'you already liked this look'; end if;
  insert into look_likes (owner, liker, version) values (p_hero, me, l.version);
end $$;

revoke execute on function public.look_lists(), public.look_circle(uuid) from public, anon, authenticated;
revoke execute on function public.look_get(), public.look_save(text, text, text, text, text, boolean), public.look_gallery(), public.look_like(uuid) from public, anon;
grant execute on function public.look_get(), public.look_save(text, text, text, text, text, boolean), public.look_gallery(), public.look_like(uuid) to authenticated;
