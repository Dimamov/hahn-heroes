-- Squad hideout: a shared room the whole squad decorates together. Each member places decorations
-- they own (up to 6 each) on a 24-spot grid. A decoration can only be in the hideout once, and only the
-- member who placed it can move or remove it. Nothing is typed; everything is a pick from owned items.
create table public.squad_base (
  squad_id uuid not null references public.squads (id) on delete cascade,
  cell int not null check (cell between 0 and 23),
  item_id text not null references public.shop_items (id),
  placed_by uuid not null references public.heroes (id) on delete cascade,
  placed_at timestamptz not null default now(),
  primary key (squad_id, cell),
  unique (squad_id, item_id)
);
alter table public.squad_base enable row level security;
revoke all on public.squad_base from anon, authenticated;

create function public.base_squad(p_hero uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select s.id from squads s join squad_members m on m.squad_id = s.id
   where m.child_id = p_hero and m.status = 'member' and s.disbanded_at is null limit 1
$$;

-- Lifts a member's own decoration from a spot or by item so it can be placed again.
create function public.base_lift(p_squad uuid, p_hero uuid, p_cell int, p_item text) returns void
language sql security definer set search_path = public as $$
  delete from squad_base where squad_id = p_squad and placed_by = p_hero and (item_id = p_item or cell = p_cell);
$$;

create function public.base_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_squad uuid := base_squad(me);
begin
  if v_squad is null then return jsonb_build_object('squad', null); end if;
  return jsonb_build_object(
    'squad', (select name from squads where id = v_squad),
    'items', coalesce((select jsonb_agg(jsonb_build_object('cell', b.cell, 'item', b.item_id, 'by', h.display_name, 'mine', b.placed_by = me) order by b.cell)
                         from squad_base b join heroes h on h.id = b.placed_by where b.squad_id = v_squad), '[]'::jsonb),
    'owned', coalesce((select jsonb_agg(i.item_id) from hero_items i join shop_items s on s.id = i.item_id where i.hero_id = me and s.kind = 'decor'), '[]'::jsonb),
    'limit', 6);
end $$;

create function public.base_place(p_cell int, p_item text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_squad uuid := base_squad(me);
  v_there squad_base;
begin
  if v_squad is null then raise exception 'join a squad first'; end if;
  if p_cell is null or p_cell not between 0 and 23 then raise exception 'pick a spot in the hideout'; end if;
  if not exists (select 1 from hero_items i join shop_items s on s.id = i.item_id where i.hero_id = me and i.item_id = p_item and s.kind = 'decor') then
    raise exception 'you do not own that decoration';
  end if;
  select * into v_there from squad_base where squad_id = v_squad and cell = p_cell;
  if v_there.cell is not null and v_there.placed_by <> me then raise exception 'that spot is taken'; end if;
  if exists (select 1 from squad_base where squad_id = v_squad and item_id = p_item and placed_by <> me) then raise exception 'that decoration is already in the hideout'; end if;
  -- moving one of my own: lift it first
  perform base_lift(v_squad, me, p_cell, p_item);
  if (select count(*) from squad_base where squad_id = v_squad and placed_by = me) >= 6 then raise exception 'you can place up to 6 decorations'; end if;
  insert into squad_base (squad_id, cell, item_id, placed_by) values (v_squad, p_cell, p_item, me);
end $$;

create function public.base_remove(p_cell int) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero(); v_squad uuid := base_squad(me);
begin
  delete from squad_base where squad_id = v_squad and cell = p_cell and placed_by = me;
  if not found then raise exception 'that is not your decoration'; end if;
end $$;

revoke execute on function public.base_squad(uuid), public.base_lift(uuid, uuid, int, text) from public, anon, authenticated;
revoke execute on function public.base_get(), public.base_place(int, text), public.base_remove(int) from public, anon;
grant execute on function public.base_get(), public.base_place(int, text), public.base_remove(int) to authenticated;
