-- Hero emotes: short moves unlocked by XP, shown on the showcase and in dorm rooms (including friend visits).
alter table public.hero_showcase add column emote text not null default 'wave'
  check (emote in ('wave', 'spin', 'dance', 'flex', 'bow', 'jump'));

create function public.emote_xp(p_emote text) returns int
language sql immutable set search_path = public as $$
  select case p_emote when 'wave' then 0 when 'spin' then 50 when 'dance' then 150 when 'flex' then 300
                      when 'bow' then 500 when 'jump' then 800 else 2147483647 end
$$;

create or replace function public.showcase_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  s hero_showcase;
begin
  select * into s from hero_showcase where hero_id = me;
  return jsonb_build_object('title', coalesce(s.title, 'rookie'), 'pose', coalesce(s.pose, 'stand'),
    'emote', coalesce(s.emote, 'wave'), 'xp', hero_xp(me),
    'unlocked', (select jsonb_agg(t) from unnest(array['rookie','keeper','detective','chronicler','streak','collector','helper','scholar']) t where title_unlocked(me, t)));
end $$;

create function public.emote_set(p_emote text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  if emote_xp(p_emote) > hero_xp(me) then raise exception 'you have not unlocked that emote yet'; end if;
  insert into hero_showcase (hero_id, emote) values (me, p_emote)
  on conflict (hero_id) do update set emote = excluded.emote, updated_at = now();
end $$;

-- Rooms show the owner's emote to visiting friends.
create or replace function public.dorm_get(p_friend uuid default null) returns jsonb
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
    'emote', coalesce((select emote from hero_showcase where hero_id = v_owner), 'wave'),
    'layout', coalesce((select layout from hero_rooms where hero_id = v_owner), '[]'::jsonb),
    'equipped', coalesce((select jsonb_object_agg(slot, item_id) from hero_equipped where hero_id = v_owner and item_id is not null), '{}'::jsonb),
    'owned', case when v_owner = me then coalesce((select jsonb_agg(i.item_id) from hero_items i join shop_items s on s.id = i.item_id where i.hero_id = me and s.kind = 'decor'), '[]'::jsonb) else null end);
end $$;

revoke execute on function public.emote_xp(text), public.emote_set(text) from public, anon;
grant execute on function public.emote_set(text) to authenticated;
