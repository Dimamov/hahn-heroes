-- Jam Session: squad mates tap synthesized sound pads together. Nothing is typed. Each member has one row
-- holding a hit counter and their last 8 pad numbers (0-23 = 3 kits of 8 pads), so the table never grows.
-- Mates poll once a second and play whatever is new.
create table public.jam_state (
  squad_id uuid not null references public.squads (id) on delete cascade,
  hero_id uuid not null references public.heroes (id) on delete cascade,
  seq bigint not null default 0,
  pads int[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (squad_id, hero_id)
);
alter table public.jam_state enable row level security;
revoke all on public.jam_state from anon, authenticated;

create function public.jam_hit(p_pads int[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_squad uuid := base_squad(me);
  v_clean int[];
begin
  if v_squad is null then raise exception 'join a squad first'; end if;
  select coalesce(array_agg(p), '{}') into v_clean
    from (select p from unnest(p_pads) p where p between 0 and 23 limit 8) q;
  if cardinality(v_clean) = 0 then return; end if;
  insert into jam_state (squad_id, hero_id, seq, pads, updated_at) values (v_squad, me, cardinality(v_clean), v_clean, now())
  on conflict (squad_id, hero_id) do update
    set seq = jam_state.seq + cardinality(v_clean),
        pads = (jam_state.pads || v_clean)[greatest(1, cardinality(jam_state.pads || v_clean) - 7):],
        updated_at = now();
end $$;

create function public.jam_feed() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_squad uuid := base_squad(me);
begin
  if v_squad is null then return jsonb_build_object('squad', null, 'mates', '[]'::jsonb); end if;
  return jsonb_build_object(
    'squad', (select name from squads where id = v_squad),
    'mates', coalesce((select jsonb_agg(jsonb_build_object('id', j.hero_id, 'name', h.display_name, 'seq', j.seq, 'pads', to_jsonb(j.pads),
                         'live', j.updated_at > now() - interval '20 seconds') order by h.display_name)
                         from jam_state j join heroes h on h.id = j.hero_id
                        where j.squad_id = v_squad and j.hero_id <> me and j.updated_at > now() - interval '5 minutes'), '[]'::jsonb));
end $$;

revoke execute on function public.jam_hit(int[]), public.jam_feed() from public, anon;
grant execute on function public.jam_hit(int[]), public.jam_feed() to authenticated;
