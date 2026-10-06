-- The Sensei can clear old chat. Nothing is erased: cleared messages are marked and hidden from kids, from
-- the Sensei's chat log and from the AI check. Messages the AI flagged and the Sensei has not reviewed yet are kept.
alter table public.chat_messages add column cleared_at timestamptz;
alter table public.friend_messages add column cleared_at timestamptz;

create or replace function public.chat_read() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room rooms;
begin
  select r.* into v_room from room_players p join rooms r on r.id = p.room_id
   where p.child_id = me and p.left_at is null and r.state in ('lobby', 'playing', 'done')
   order by p.joined_at desc limit 1;
  return jsonb_build_object(
    'banned', exists (select 1 from chat_status where child_id = me and banned_at is not null),
    'can_chat', chat_open(me, v_room.id),
    'messages', case when v_room.id is null or not chat_open(me, v_room.id) then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', h.display_name, 'me', m.child_id = me, 'body', m.body) order by m.id)
        from (select * from chat_messages where room_id = v_room.id and cleared_at is null order by id desc limit 25) m
        join heroes h on h.id = m.child_id), '[]'::jsonb) end);
end $$;

create or replace function public.friend_chat_read(p_friend uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_friends boolean := exists (select 1 from friendships f where f.status = 'accepted' and ((f.a = me and f.b = p_friend) or (f.a = p_friend and f.b = me)));
begin
  return jsonb_build_object(
    'banned', exists (select 1 from chat_status where child_id = me and banned_at is not null),
    'can_chat', v_friends,
    'messages', case when not v_friends then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', h.display_name, 'me', m.sender = me, 'body', m.body) order by m.id)
        from (select * from friend_messages
               where ((sender = me and recipient = p_friend) or (sender = p_friend and recipient = me)) and cleared_at is null
               order by id desc limit 30) m
        join heroes h on h.id = m.sender), '[]'::jsonb) end);
end $$;

create or replace function public.sensei_chat_log(p_child uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  return coalesce((select jsonb_agg(x.j order by x.at) from (
      select m.created_at at, jsonb_build_object('name', h.display_name, 'child', m.child_id = p_child, 'body', m.body, 'at', m.created_at) j
        from (select * from chat_messages
               where room_id in (select room_id from room_players where child_id = p_child) and cleared_at is null
               order by id desc limit 25) m
        join heroes h on h.id = m.child_id
      union all
      select f.created_at, jsonb_build_object('name', h.display_name, 'child', f.sender = p_child, 'body', '(friend chat) ' || f.body, 'at', f.created_at)
        from (select * from friend_messages where (sender = p_child or recipient = p_child) and cleared_at is null order by id desc limit 25) f
        join heroes h on h.id = f.sender) x), '[]'::jsonb);
end $$;

create or replace function public.sensei_chat_ai_batch() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  if (select count(*) from chat_ai_checked where checked_at > now() - interval '1 day') >= 600 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('key', x.key, 'body', x.body) order by x.at desc) from (
    select * from (
      select 'r:' || m.id as key, m.body, m.created_at as at from chat_messages m
       where m.created_at > now() - interval '14 days' and m.cleared_at is null and not exists (select 1 from chat_ai_checked c where c.kind = 'room' and c.message_id = m.id)
      union all
      select 'f:' || f.id, f.body, f.created_at from friend_messages f
       where f.created_at > now() - interval '14 days' and f.cleared_at is null and not exists (select 1 from chat_ai_checked c where c.kind = 'friend' and c.message_id = f.id)
    ) u order by at desc limit 60) x), '[]'::jsonb);
end $$;

-- Which saved messages are older than p_days and can be cleared (flagged ones the Sensei has not reviewed stay).
create function public.sensei_chat_old_count(p_days int default 30) returns int
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  return (select count(*) from chat_messages m where m.cleared_at is null and m.created_at < now() - make_interval(days => p_days)
            and not exists (select 1 from chat_ai_checked c where c.kind = 'room' and c.message_id = m.id and c.flagged and c.reviewed_at is null))::int
       + (select count(*) from friend_messages f where f.cleared_at is null and f.created_at < now() - make_interval(days => p_days)
            and not exists (select 1 from chat_ai_checked c where c.kind = 'friend' and c.message_id = f.id and c.flagged and c.reviewed_at is null))::int;
end $$;

create function public.sensei_chat_clear_old(p_days int default 30) returns int
language plpgsql security definer set search_path = public as $$
declare a int; b int;
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  if p_days < 7 then raise exception 'keep at least the last 7 days'; end if;
  update chat_messages m set cleared_at = now() where m.cleared_at is null and m.created_at < now() - make_interval(days => p_days)
     and not exists (select 1 from chat_ai_checked c where c.kind = 'room' and c.message_id = m.id and c.flagged and c.reviewed_at is null);
  get diagnostics a = row_count;
  update friend_messages f set cleared_at = now() where f.cleared_at is null and f.created_at < now() - make_interval(days => p_days)
     and not exists (select 1 from chat_ai_checked c where c.kind = 'friend' and c.message_id = f.id and c.flagged and c.reviewed_at is null);
  get diagnostics b = row_count;
  return a + b;
end $$;

revoke execute on function public.sensei_chat_old_count(int), public.sensei_chat_clear_old(int) from public, anon;
grant execute on function public.sensei_chat_old_count(int), public.sensei_chat_clear_old(int) to authenticated;
