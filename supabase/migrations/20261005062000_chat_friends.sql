-- Chat without a classroom: a hero in a class chats as before. A hero with no class can chat only when every
-- other hero in the room is someone they already have a link to (an accepted friend or a squad mate), and sees
-- the room's messages only then. Same filter, pause and Sensei review as every other chat.
create function public.chat_linked(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships f where f.status = 'accepted' and ((f.a = p_a and f.b = p_b) or (f.a = p_b and f.b = p_a)))
      or exists (select 1 from squad_members x join squad_members y on y.squad_id = x.squad_id
                  where x.child_id = p_a and y.child_id = p_b and x.status = 'member' and y.status = 'member')
$$;

create function public.chat_open(p_hero uuid, p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from class_members where child_id = p_hero)
      or (p_room is not null and not exists (select 1 from room_players rp
           where rp.room_id = p_room and rp.left_at is null and rp.child_id <> p_hero and not chat_linked(p_hero, rp.child_id)))
$$;
revoke execute on function public.chat_linked(uuid, uuid), public.chat_open(uuid, uuid) from public, anon, authenticated;

create or replace function public.chat_send(p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room rooms;
  v_text text := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
  v_status chat_status;
begin
  select r.* into v_room from room_players p join rooms r on r.id = p.room_id
   where p.child_id = me and p.left_at is null and r.state in ('lobby', 'playing');
  if v_room.id is null then raise exception 'join a room to chat'; end if;
  if not chat_open(me, v_room.id) then return jsonb_build_object('ok', false, 'no_class', true); end if;
  if char_length(v_text) = 0 or char_length(v_text) > 80 then raise exception 'messages are 1 to 80 letters'; end if;

  insert into chat_status (child_id) values (me) on conflict do nothing;
  select * into v_status from chat_status where child_id = me for update;
  if v_status.banned_at is not null then return jsonb_build_object('ok', false, 'banned', true); end if;

  if exists (select 1 from chat_messages where child_id = me and created_at > clock_timestamp() - interval '1 second') then
    return jsonb_build_object('ok', false, 'slow', true);
  end if;
  -- Contact details and links stay out of chat.
  if v_text ~* '(https?:|www\.|\.com|\.net|\.org|@)' or v_text ~ '[0-9][^0-9]*[0-9][^0-9]*[0-9][^0-9]*[0-9][^0-9]*[0-9][^0-9]*[0-9]' then
    return jsonb_build_object('ok', false, 'private', true);
  end if;

  if chat_flagged(v_text) then
    update chat_status set strikes = strikes + 1, banned_at = case when strikes + 1 >= 2 then now() end where child_id = me returning * into v_status;
    return jsonb_build_object('ok', false, 'warning', v_status.banned_at is null, 'banned', v_status.banned_at is not null);
  end if;

  insert into chat_messages (room_id, child_id, body, created_at) values (v_room.id, me, v_text, clock_timestamp());
  return jsonb_build_object('ok', true);
end $$;

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
        from (select * from chat_messages where room_id = v_room.id order by id desc limit 25) m
        join heroes h on h.id = m.child_id), '[]'::jsonb) end);
end $$;
