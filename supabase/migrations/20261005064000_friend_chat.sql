-- Friend chat: two accepted friends can message each other directly, no classroom or game room needed.
-- Same word filter, link and number block, one message a second, two-strike pause (shared with room chat)
-- and Sensei review. Only accepted friends: removing a friend closes the conversation.
create table public.friend_messages (
  id bigint generated always as identity primary key,
  sender uuid not null references public.heroes (id) on delete cascade,
  recipient uuid not null references public.heroes (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 80),
  created_at timestamptz not null default clock_timestamp()
);
create index friend_messages_pair_idx on public.friend_messages (least(sender, recipient), greatest(sender, recipient), id desc);
alter table public.friend_messages enable row level security;
revoke all on public.friend_messages from anon, authenticated;

create function public.friend_chat_send(p_friend uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_text text := btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
  v_status chat_status;
begin
  if not exists (select 1 from friendships f where f.status = 'accepted' and ((f.a = me and f.b = p_friend) or (f.a = p_friend and f.b = me))) then
    raise exception 'you can only chat with friends';
  end if;
  if char_length(v_text) = 0 or char_length(v_text) > 80 then raise exception 'messages are 1 to 80 letters'; end if;
  insert into chat_status (child_id) values (me) on conflict do nothing;
  select * into v_status from chat_status where child_id = me for update;
  if v_status.banned_at is not null then return jsonb_build_object('ok', false, 'banned', true); end if;
  if exists (select 1 from chat_messages where child_id = me and created_at > clock_timestamp() - interval '1 second')
     or exists (select 1 from friend_messages where sender = me and created_at > clock_timestamp() - interval '1 second') then
    return jsonb_build_object('ok', false, 'slow', true);
  end if;
  if v_text ~* '(https?:|www\.|\.com|\.net|\.org|@)' or v_text ~ '[0-9][^0-9]*[0-9][^0-9]*[0-9][^0-9]*[0-9][^0-9]*[0-9][^0-9]*[0-9]' then
    return jsonb_build_object('ok', false, 'private', true);
  end if;
  if chat_flagged(v_text) then
    update chat_status set strikes = strikes + 1, banned_at = case when strikes + 1 >= 2 then now() end where child_id = me returning * into v_status;
    return jsonb_build_object('ok', false, 'warning', v_status.banned_at is null, 'banned', v_status.banned_at is not null);
  end if;
  insert into friend_messages (sender, recipient, body) values (me, p_friend, v_text);
  return jsonb_build_object('ok', true);
end $$;

create function public.friend_chat_read(p_friend uuid) returns jsonb
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
               where (sender = me and recipient = p_friend) or (sender = p_friend and recipient = me)
               order by id desc limit 30) m
        join heroes h on h.id = m.sender), '[]'::jsonb) end);
end $$;

-- The Sensei's review of a paused hero now includes their friend messages.
create or replace function public.sensei_chat_log(p_child uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  return coalesce((select jsonb_agg(x.j order by x.at) from (
      select m.created_at at, jsonb_build_object('name', h.display_name, 'child', m.child_id = p_child, 'body', m.body, 'at', m.created_at) j
        from (select * from chat_messages
               where room_id in (select room_id from room_players where child_id = p_child)
               order by id desc limit 25) m
        join heroes h on h.id = m.child_id
      union all
      select f.created_at, jsonb_build_object('name', h.display_name, 'child', f.sender = p_child, 'body', '(friend chat) ' || f.body, 'at', f.created_at)
        from (select * from friend_messages where sender = p_child or recipient = p_child order by id desc limit 25) f
        join heroes h on h.id = f.sender) x), '[]'::jsonb);
end $$;

revoke execute on function public.friend_chat_send(uuid, text), public.friend_chat_read(uuid) from public, anon;
grant execute on function public.friend_chat_send(uuid, text), public.friend_chat_read(uuid) to authenticated;
