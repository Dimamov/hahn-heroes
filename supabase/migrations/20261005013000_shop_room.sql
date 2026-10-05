-- Collections, part 1: the shop, the wardrobe and dorm rooms.
-- Coins buy items through spend(); XP only unlocks items and is never spent.
create table public.shop_items (
  id text primary key,
  kind text not null check (kind in ('outfit', 'accessory', 'decor')),
  slot text check (slot in ('outfit', 'hat', 'face', 'back')),
  name text not null,
  icon text not null,
  price int not null check (price > 0),
  unlock_xp int not null default 0 check (unlock_xp >= 0),
  check ((kind = 'decor') = (slot is null))
);
create table public.hero_items (
  hero_id uuid not null references public.heroes (id) on delete cascade,
  item_id text not null references public.shop_items (id),
  bought_at timestamptz not null default now(),
  primary key (hero_id, item_id)
);
create table public.hero_equipped (
  hero_id uuid not null references public.heroes (id) on delete cascade,
  slot text not null check (slot in ('outfit', 'hat', 'face', 'back')),
  item_id text references public.shop_items (id),   -- null means the slot is bare
  primary key (hero_id, slot)
);
create table public.hero_rooms (
  hero_id uuid primary key references public.heroes (id) on delete cascade,
  layout jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
alter table public.shop_items enable row level security;
alter table public.hero_items enable row level security;
alter table public.hero_equipped enable row level security;
alter table public.hero_rooms enable row level security;
revoke all on public.shop_items, public.hero_items, public.hero_equipped, public.hero_rooms from anon, authenticated;

insert into public.shop_items (id, kind, slot, name, icon, price, unlock_xp) values
  ('o-nexus-hoodie','outfit','outfit','Nexus Hoodie','🧥',60,0),
  ('o-academy-blazer','outfit','outfit','Academy Blazer','🥼',90,0),
  ('o-explorer-vest','outfit','outfit','Explorer Vest','🦺',120,50),
  ('o-storm-cloak','outfit','outfit','Storm Cloak','🧣',160,100),
  ('o-cyber-jacket','outfit','outfit','Cyber Jacket','🎽',220,200),
  ('o-keeper-robe','outfit','outfit','Keeper Robe','👘',300,300),
  ('o-flame-coat','outfit','outfit','Flame Coat','🔥',360,400),
  ('o-star-armor','outfit','outfit','Star Armor','🛡️',480,600),
  ('a-cap','accessory','hat','Hero Cap','🧢',30,0),
  ('a-wizard-hat','accessory','hat','Wizard Hat','🎩',80,50),
  ('a-crown','accessory','hat','Little Crown','👑',250,300),
  ('a-headphones','accessory','hat','Beat Headphones','🎧',70,0),
  ('a-shades','accessory','face','Cool Shades','🕶️',40,0),
  ('a-goggles','accessory','face','Lab Goggles','🥽',70,100),
  ('a-star-mask','accessory','face','Star Mask','🎭',110,200),
  ('a-cape','accessory','back','Hero Cape','🦸',90,0),
  ('a-wings','accessory','back','Light Wings','🪽',300,400),
  ('a-backpack','accessory','back','Quest Pack','🎒',50,0),
  ('d-beanbag','decor',null,'Bean Bag','🛋️',40,0),
  ('d-lamp','decor',null,'Glow Lamp','💡',30,0),
  ('d-plant','decor',null,'Nexus Fern','🪴',35,0),
  ('d-poster','decor',null,'Hero Poster','🖼️',45,0),
  ('d-books','decor',null,'Story Shelf','📚',60,0),
  ('d-globe','decor',null,'Spin Globe','🌍',80,50),
  ('d-telescope','decor',null,'Star Telescope','🔭',120,100),
  ('d-crystal','decor',null,'Violet Crystal','🔮',150,150),
  ('d-rug','decor',null,'Spark Rug','🟣',55,0),
  ('d-arcade','decor',null,'Mini Arcade','🕹️',200,200),
  ('d-aquarium','decor',null,'Glow Aquarium','🐠',180,250),
  ('d-guitar','decor',null,'Air Guitar','🎸',70,0),
  ('d-trophy','decor',null,'Trophy Case','🏆',260,400),
  ('d-moon','decor',null,'Moon Window','🌙',140,150),
  ('d-lantern','decor',null,'Paper Lantern','🏮',50,0),
  ('d-statue','decor',null,'Hero Statue','🗿',320,500);

create function public.hero_xp(p_hero uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::int from ledger_entries where child_id = p_hero and currency = 'xp'
$$;

-- Everything the shop and wardrobe screens need in one call.
create function public.shop_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_xp int := hero_xp(me);
begin
  return jsonb_build_object(
    'coins', (select coalesce(sum(amount), 0) from ledger_entries where child_id = me and currency = 'coins'),
    'xp', v_xp,
    'items', (select jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'slot', s.slot, 'name', s.name, 'icon', s.icon,
                'price', s.price, 'unlock_xp', s.unlock_xp,
                'owned', exists (select 1 from hero_items h where h.hero_id = me and h.item_id = s.id),
                'locked', s.unlock_xp > v_xp) order by s.unlock_xp, s.price, s.id) from shop_items s),
    'equipped', coalesce((select jsonb_object_agg(slot, item_id) from hero_equipped where hero_id = me), '{}'::jsonb));
end $$;

create function public.shop_buy(p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  s shop_items;
  r jsonb;
begin
  select * into s from shop_items where id = p_item;
  if s.id is null then raise exception 'no such item'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 7));
  if exists (select 1 from hero_items where hero_id = me and item_id = s.id) then
    return jsonb_build_object('ok', false, 'reason', 'already_owned');
  end if;
  if s.unlock_xp > hero_xp(me) then return jsonb_build_object('ok', false, 'reason', 'locked'); end if;
  r := spend(me, s.price, 'shop:' || s.id, 'shop:' || s.id);
  if not (r->>'ok')::boolean then return r; end if;
  insert into hero_items (hero_id, item_id) values (me, s.id);
  return jsonb_build_object('ok', true, 'balance', r->'balance');
end $$;

-- Wear an owned outfit or accessory, or take the slot off with a null item.
create function public.hero_equip(p_slot text, p_item text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  s shop_items;
begin
  if p_slot not in ('outfit', 'hat', 'face', 'back') then raise exception 'no such slot'; end if;
  if p_item is not null then
    select * into s from shop_items where id = p_item;
    if s.id is null or s.slot is distinct from p_slot then raise exception 'that does not go there'; end if;
    if not exists (select 1 from hero_items where hero_id = me and item_id = p_item) then raise exception 'you do not own that yet'; end if;
  end if;
  insert into hero_equipped (hero_id, slot, item_id) values (me, p_slot, p_item)
  on conflict (hero_id, slot) do update set item_id = excluded.item_id;
end $$;

-- A dorm room: your own, or an accepted friend's. Items sit in cells 0 to 23 (6 across, 4 down).
create function public.dorm_get(p_friend uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_owner uuid := coalesce(p_friend, me);
  h heroes;
begin
  if v_owner <> me and not exists (
    select 1 from friendships f where f.status = 'accepted' and ((f.a = me and f.b = v_owner) or (f.b = me and f.a = v_owner))
  ) then raise exception 'only friends can visit'; end if;
  select * into h from heroes where id = v_owner;
  return jsonb_build_object('mine', v_owner = me, 'name', h.display_name, 'starter', h.starter_hero,
    'layout', coalesce((select layout from hero_rooms where hero_id = v_owner), '[]'::jsonb),
    'equipped', coalesce((select jsonb_object_agg(slot, item_id) from hero_equipped where hero_id = v_owner and item_id is not null), '{}'::jsonb),
    'owned', case when v_owner = me then coalesce((select jsonb_agg(i.item_id) from hero_items i join shop_items s on s.id = i.item_id where i.hero_id = me and s.kind = 'decor'), '[]'::jsonb) else null end);
end $$;

create function public.dorm_save(p_layout jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  e jsonb;
  v_items text[] := '{}';
  v_cells int[] := '{}';
  v_cell int;
begin
  if jsonb_typeof(p_layout) <> 'array' or jsonb_array_length(p_layout) > 24 then raise exception 'room layout is not valid'; end if;
  for e in select jsonb_array_elements(p_layout) loop
    if jsonb_typeof(e->'cell') <> 'number' or jsonb_typeof(e->'item') <> 'string' then raise exception 'room layout is not valid'; end if;
    v_cell := (e->>'cell')::numeric::int;
    if v_cell <> (e->>'cell')::numeric or v_cell not between 0 and 23 or v_cell = any (v_cells) or (e->>'item') = any (v_items) then
      raise exception 'room layout is not valid';
    end if;
    if not exists (select 1 from hero_items i join shop_items s on s.id = i.item_id
                    where i.hero_id = me and i.item_id = e->>'item' and s.kind = 'decor') then
      raise exception 'you do not own that decoration';
    end if;
    v_items := v_items || (e->>'item');
    v_cells := v_cells || v_cell;
  end loop;
  insert into hero_rooms (hero_id, layout) select me, coalesce(jsonb_agg(jsonb_build_object('item', x->>'item', 'cell', (x->>'cell')::int) order by (x->>'cell')::int), '[]'::jsonb)
    from jsonb_array_elements(p_layout) x
  on conflict (hero_id) do update set layout = excluded.layout, updated_at = now();
end $$;

revoke execute on function public.hero_xp(uuid), public.shop_state(), public.shop_buy(text), public.hero_equip(text, text),
  public.dorm_get(uuid), public.dorm_save(jsonb) from public, anon;
grant execute on function public.shop_state(), public.shop_buy(text), public.hero_equip(text, text),
  public.dorm_get(uuid), public.dorm_save(jsonb) to authenticated;
