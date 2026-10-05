-- Seasonal events: limited-time shop items. The Sensei can move the dates or switch an event off.
-- An item is for sale only while its event is live; heroes keep what they bought.
create table public.seasonal_events (
  id text primary key,
  name text not null,
  icon text not null,
  blurb text not null,
  starts date not null,
  ends date not null,
  enabled boolean not null default true,
  check (ends >= starts)
);
alter table public.seasonal_events enable row level security;
revoke all on public.seasonal_events from anon, authenticated;
alter table public.shop_items add column event_id text references public.seasonal_events (id);

insert into public.seasonal_events (id, name, icon, blurb, starts, ends) values
  ('fall', 'Fall Festival', '🍂', 'Cozy harvest gear, here for a little while.', '2026-10-12', '2026-11-02'),
  ('winter', 'Winter Lights', '❄️', 'Sparkly winter gear to brighten the cold days.', '2026-12-01', '2027-01-05'),
  ('spring', 'Spring Bloom', '🌸', 'Flowers and kites for the first warm days.', '2027-03-15', '2027-04-15');

insert into public.shop_items (id, kind, slot, name, icon, price, unlock_xp, event_id) values
  ('a-leaf-crown','accessory','hat','Leaf Crown','🍁',90,0,'fall'),
  ('o-harvest-cloak','outfit','outfit','Harvest Cloak','🧑‍🌾',140,0,'fall'),
  ('d-pumpkin','decor',null,'Big Pumpkin','🎃',70,0,'fall'),
  ('d-hay','decor',null,'Hay Bale','🌾',60,0,'fall'),
  ('a-ice-crown','accessory','hat','Ice Crown','🧊',100,0,'winter'),
  ('o-snow-parka','outfit','outfit','Snow Parka','🥶',150,0,'winter'),
  ('d-snowman','decor',null,'Snowman','⛄',70,0,'winter'),
  ('d-lights','decor',null,'Winter Lights','🎇',80,0,'winter'),
  ('a-flower-crown','accessory','hat','Flower Crown','🌸',90,0,'spring'),
  ('a-butterfly','accessory','back','Butterfly Wings','🦋',130,0,'spring'),
  ('d-blossom','decor',null,'Blossom Pot','🌷',60,0,'spring'),
  ('d-kite','decor',null,'Sky Kite','🪁',70,0,'spring');

create function public.event_live(p_event text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select enabled and school_date(now()) between starts and ends from seasonal_events where id = p_event), false)
$$;

create or replace function public.shop_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_xp int := hero_xp(me);
begin
  return jsonb_build_object(
    'coins', (select coalesce(sum(amount), 0) from ledger_entries where child_id = me and currency = 'coins'),
    'xp', v_xp,
    'items', (select jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'slot', s.slot, 'name', s.name, 'icon', s.icon,
                'price', s.price, 'unlock_xp', s.unlock_xp, 'event', s.event_id,
                'owned', exists (select 1 from hero_items h where h.hero_id = me and h.item_id = s.id),
                'locked', s.unlock_xp > v_xp) order by s.unlock_xp, s.price, s.id)
               from shop_items s
              where s.event_id is null or event_live(s.event_id)
                 or exists (select 1 from hero_items h where h.hero_id = me and h.item_id = s.id)),
    'equipped', coalesce((select jsonb_object_agg(slot, item_id) from hero_equipped where hero_id = me), '{}'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'icon', e.icon, 'blurb', e.blurb,
                'starts', e.starts, 'ends', e.ends, 'live', school_date(now()) >= e.starts) order by e.starts)
               from seasonal_events e where e.enabled and e.ends >= school_date(now()) and e.starts <= school_date(now()) + 14), '[]'::jsonb));
end $$;

create or replace function public.shop_buy(p_item text) returns jsonb
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
  if s.event_id is not null and not event_live(s.event_id) then return jsonb_build_object('ok', false, 'reason', 'event_over'); end if;
  if s.unlock_xp > hero_xp(me) then return jsonb_build_object('ok', false, 'reason', 'locked'); end if;
  r := spend(me, s.price, 'shop:' || s.id, 'shop:' || s.id);
  if not (r->>'ok')::boolean then return r; end if;
  insert into hero_items (hero_id, item_id) values (me, s.id);
  return jsonb_build_object('ok', true, 'balance', r->'balance');
end $$;

create function public.sensei_events() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do that'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'icon', icon, 'starts', starts, 'ends', ends, 'enabled', enabled,
    'items', (select count(*) from shop_items where event_id = e.id)) order by starts) from seasonal_events e), '[]'::jsonb);
end $$;

create function public.sensei_set_event(p_id text, p_starts date, p_ends date, p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do that'; end if;
  if p_starts is null or p_ends is null or p_ends < p_starts then raise exception 'the end date must be after the start'; end if;
  if p_ends - p_starts > 90 then raise exception 'events last up to 90 days'; end if;
  update seasonal_events set starts = p_starts, ends = p_ends, enabled = coalesce(p_enabled, true) where id = p_id;
  if not found then raise exception 'no such event'; end if;
end $$;

revoke execute on function public.event_live(text), public.sensei_events(), public.sensei_set_event(text, date, date, boolean) from public, anon;
grant execute on function public.sensei_events(), public.sensei_set_event(text, date, date, boolean) to authenticated;
