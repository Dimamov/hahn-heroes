-- Moderated room chat. Short messages inside a game room only: no direct messages. The server
-- filters every message. First swear word gets a warning, the second pauses chat. A parent can ask
-- the Sensei to unlock it. Nothing is deleted.

create table public.chat_messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  child_id uuid not null references public.heroes (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 80),
  created_at timestamptz not null default now()
);
create index chat_messages_room_idx on public.chat_messages (room_id, id desc);

create table public.chat_status (
  child_id uuid primary key references public.heroes (id) on delete cascade,
  strikes int not null default 0,
  banned_at timestamptz,
  unlock_requested_at timestamptz,
  unlocked_at timestamptz
);

alter table public.chat_messages enable row level security;
alter table public.chat_status enable row level security;
revoke all on public.chat_messages, public.chat_status from anon, authenticated;

-- Words are matched after turning look-alike characters back into letters. Long words match
-- anywhere in a message; short ones only as whole words, so ordinary words are never blocked.
insert into public.app_settings (key, value) values
  ('chat_blocklist', '{"anywhere": ["shit", "fuck", "bitch", "nigg", "fagg", "cunt", "whore", "slut", "bastard", "retard"],
                       "whole": ["ass", "asshole", "damn", "crap", "dick", "piss", "fck", "fuk", "fag", "kys", "wtf", "stfu", "hoe", "sex", "porn", "nude"]}')
on conflict (key) do nothing;

create function public.chat_clean(p_text text) returns text
language sql immutable as $$
  select regexp_replace(translate(lower(p_text), '0134578@$!', 'oieastbasi'), '[^a-z ]', '', 'g')
$$;

create function public.chat_flagged(p_text text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_cfg jsonb := setting('chat_blocklist');
  v_clean text := chat_clean(p_text);
  v_squashed text := replace(v_clean, ' ', '');
  w text;
begin
  for w in select jsonb_array_elements_text(v_cfg->'anywhere') loop
    if position(w in v_squashed) > 0 then return true; end if;
  end loop;
  for w in select jsonb_array_elements_text(v_cfg->'whole') loop
    if v_clean ~ ('(^| )' || w || '( |$)') then return true; end if;
  end loop;
  return false;
end $$;

create function public.chat_send(p_text text) returns jsonb
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

create function public.chat_read() returns jsonb
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
    'messages', case when v_room.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', h.display_name, 'me', m.child_id = me, 'body', m.body) order by m.id)
        from (select * from chat_messages where room_id = v_room.id order by id desc limit 25) m
        join heroes h on h.id = m.child_id), '[]'::jsonb) end);
end $$;

-- Parents see whether chat is paused for a linked child and can ask the Sensei to unlock it.
create function public.child_chat(p_child uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v chat_status;
begin
  if not parent_of(p_child) then raise exception 'not your child'; end if;
  select * into v from chat_status where child_id = p_child;
  return jsonb_build_object('banned', v.banned_at is not null, 'requested', v.unlock_requested_at is not null and v.banned_at is not null);
end $$;

create function public.chat_request_unlock(p_child uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not parent_of(p_child) then raise exception 'not your child'; end if;
  update chat_status set unlock_requested_at = now() where child_id = p_child and banned_at is not null;
end $$;

create function public.sensei_chat_requests() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('child_id', s.child_id, 'name', h.display_name, 'grade', h.grade,
                      'requested', s.unlock_requested_at is not null) order by s.unlock_requested_at nulls last, s.banned_at)
                     from chat_status s join heroes h on h.id = s.child_id where s.banned_at is not null), '[]'::jsonb);
end $$;

create function public.chat_unlock(p_child uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  update chat_status set banned_at = null, unlock_requested_at = null, unlocked_at = now(), strikes = 1 where child_id = p_child and banned_at is not null;
end $$;

revoke execute on function public.chat_clean(text), public.chat_flagged(text) from public, anon, authenticated;
revoke execute on function public.chat_send(text), public.chat_read(), public.child_chat(uuid), public.chat_request_unlock(uuid),
  public.sensei_chat_requests(), public.chat_unlock(uuid) from public, anon;
grant execute on function public.chat_send(text), public.chat_read(), public.child_chat(uuid), public.chat_request_unlock(uuid),
  public.sensei_chat_requests(), public.chat_unlock(uuid) to authenticated;
