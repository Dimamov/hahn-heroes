-- Safety review fixes, part 1: room-code guessing limit, chat only for heroes in a class,
-- a reported drawing disappears at once, and the Sensei can read a paused hero's recent chat.

-- Room codes: ten wrong guesses in ten minutes pause joining. A wrong code is recorded and answered
-- with null (an exception would roll the record back); the app shows the usual message.
create table public.room_join_misses (
  id bigint generated always as identity primary key,
  hero_id uuid not null references public.heroes (id) on delete cascade,
  at timestamptz not null default now()
);
create index room_join_misses_idx on public.room_join_misses (hero_id, at desc);
alter table public.room_join_misses enable row level security;
revoke all on public.room_join_misses from anon, authenticated;

create or replace function public.room_join(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room rooms;
  v_rules jsonb := setting('room_rules');
  v_n int;
  v_mine text := my_room();
begin
  select * into v_room from rooms where code = upper(trim(p_code)) and state in ('lobby', 'playing');
  if v_mine is not null then
    if v_mine = v_room.code then return v_mine; end if;
    raise exception 'leave your room first';
  end if;
  if (select count(*) from room_join_misses where hero_id = me and at > now() - interval '10 minutes') >= 10 then
    raise exception 'too many tries, wait a few minutes';
  end if;
  if v_room.id is null or (select grade from heroes where id = me) <> v_room.grade then
    insert into room_join_misses (hero_id) values (me);
    return null;
  end if;
  if v_room.state <> 'lobby' then raise exception 'that game already started'; end if;
  select count(*) into v_n from room_players where room_id = v_room.id and left_at is null;
  if v_n >= (v_rules->>'max_players')::int then raise exception 'the room is full'; end if;
  insert into room_players (room_id, child_id) values (v_room.id, me)
  on conflict (room_id, child_id) do update set left_at = null;
  return v_room.code;
end $$;

-- Chat: heroes who have joined a teacher's class only.
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
  if not exists (select 1 from class_members where child_id = me) then return jsonb_build_object('ok', false, 'no_class', true); end if;
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
    'can_chat', exists (select 1 from class_members where child_id = me),
    'messages', case when v_room.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', h.display_name, 'me', m.child_id = me, 'body', m.body) order by m.id)
        from (select * from chat_messages where room_id = v_room.id order by id desc limit 25) m
        join heroes h on h.id = m.child_id), '[]'::jsonb) end);
end $$;

-- The Sensei reads the last 25 lines from the rooms a paused hero was in.
create function public.sensei_chat_log(p_child uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('name', h.display_name, 'child', m.child_id = p_child, 'body', m.body, 'at', m.created_at) order by m.id)
    from (select * from chat_messages
           where room_id in (select room_id from room_players where child_id = p_child)
           order by id desc limit 25) m
    join heroes h on h.id = m.child_id), '[]'::jsonb);
end $$;

-- A reported drawing disappears for the room on the first report and stays hidden for that round.
alter table public.drawing_games add column frozen boolean not null default false;

create function public.drawing_freeze_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.round is distinct from old.round then
    new.frozen := false;
  elsif old.frozen and new.phase = 'draw' then
    new.strokes := '[]'::jsonb;
    new.frozen := true;
  end if;
  return new;
end $$;
create trigger drawing_freeze before update on public.drawing_games
for each row execute function public.drawing_freeze_guard();

create or replace function public.drawing_report() returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room uuid := drawing_room();
  g drawing_games;
  v_artist uuid;
  v_n int;
  v_guessers int;
begin
  if v_room is null then raise exception 'you are not in a game'; end if;
  select * into g from drawing_games where room_id = v_room;
  v_artist := (g.order_ids ->> g.round)::uuid;
  if v_artist = me then raise exception 'you are drawing'; end if;
  insert into drawing_reports (room_id, round, artist, reporter, word) values (v_room, g.round, v_artist, me, g.word)
  on conflict (room_id, round, reporter) do nothing;
  if g.phase = 'draw' then
    update drawing_games set strokes = '[]', frozen = true where room_id = v_room;
  end if;
  select count(*) into v_n from drawing_reports where room_id = v_room and round = g.round;
  select count(*) into v_guessers from room_players where room_id = v_room and left_at is null and child_id <> v_artist;
  if g.phase = 'draw' and v_n >= least(2, v_guessers) then
    update drawing_games set voided = true, strokes = '[]' where room_id = v_room;
    perform drawing_tick(v_room);
  end if;
end $$;

revoke execute on function public.room_join(text), public.chat_send(text), public.chat_read(), public.sensei_chat_log(uuid),
  public.drawing_report(), public.drawing_freeze_guard() from public, anon;
grant execute on function public.room_join(text), public.chat_send(text), public.chat_read(), public.sensei_chat_log(uuid),
  public.drawing_report() to authenticated;
