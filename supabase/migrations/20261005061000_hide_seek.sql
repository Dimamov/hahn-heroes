-- Hide and Seek: a simple 2D prop hunt for 2 to 6 heroes in a private room. The hall is a 6 by 4 grid of
-- props. Each round one hero is the seeker and everyone else hides by picking a spot, disguised as the prop
-- already there. The seeker checks spots (a few searches, one clock). Each hider may sneak to a new spot once
-- while the seeker is searching. Everyone is the seeker once. Nothing is typed (the room chat is the same
-- moderated chat as every other room).

alter table public.rooms drop constraint rooms_game_check;
alter table public.rooms add constraint rooms_game_check check (game in ('trivia-clash', 'odin', 'shadow-signal', 'squad-drawing', 'escape-nexus', 'hide-seek'));

create table public.hide_games (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  order_ids jsonb not null,
  round int not null default 0,
  phase text not null default 'hide' check (phase in ('hide', 'seek', 'reveal', 'done')),
  phase_started_at timestamptz not null default now(),
  layout jsonb not null,
  spots jsonb not null default '{}',
  caught jsonb not null default '[]',
  found jsonb not null default '[]',
  searched jsonb not null default '[]',
  sneaked jsonb not null default '[]'
);
alter table public.hide_games enable row level security;
revoke all on public.hide_games from anon, authenticated;

insert into public.app_settings (key, value) values
  ('hide_rules', '{"hide_seconds": 20, "seek_seconds": 40, "reveal_seconds": 6, "searches": 6, "spots": 24}') on conflict (key) do nothing;

create function public.hide_deal(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_order jsonb;
begin
  select jsonb_agg(child_id order by random()) into v_order from room_players where room_id = p_room and left_at is null;
  insert into hide_games (room_id, order_ids, layout)
  values (p_room, v_order, (select jsonb_agg(e order by random()) from (
    select e from unnest(array['🪴','🛋️','📚','🖼️','🕰️','🧸','🪑','💡','🎹','🧺','🪞','🛏️','🚪','🪟','🎒','🏺','🔭','🧪','🤖','🌵','🧳','📦','🎮','🥁','🪁','🛹','🎨','⚽','🏀','🎲','🧩','📺','🪜','🛁','🧯','🔔','🪣','🎸','🚲','🛸']) e order by random() limit 24) s));
end $$;

create function public.hide_room() returns uuid
language sql stable security definer set search_path = public as $$
  select r.id from room_players p join rooms r on r.id = p.room_id
   where p.child_id = auth.uid() and p.left_at is null and r.state = 'playing' and r.game = 'hide-seek'
$$;

-- Moves the game on one step when the clock or the players say so.
create function public.hide_tick(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  g hide_games;
  v_rules jsonb := setting('hide_rules');
  v_seeker uuid;
  v_hiders uuid[];
  v_spots int := (setting('hide_rules')->>'spots')::int;
  h uuid;
  v_seeker_here boolean;
  v_all_caught boolean;
  v_live int;
begin
  select * into g from hide_games where room_id = p_room for update;
  if g.room_id is null or g.phase = 'done' then return; end if;
  select count(*) into v_live from room_players where room_id = p_room and left_at is null;
  if v_live < 2 then
    update hide_games set phase = 'done', phase_started_at = now() where room_id = p_room;
    update rooms set state = 'done' where id = p_room;
    return;
  end if;
  v_seeker := (g.order_ids ->> g.round)::uuid;
  v_seeker_here := exists (select 1 from room_players where room_id = p_room and child_id = v_seeker and left_at is null);
  select coalesce(array_agg(child_id), '{}') into v_hiders from room_players where room_id = p_room and left_at is null and child_id <> v_seeker;

  if g.phase = 'hide' then
    if now() > g.phase_started_at + make_interval(secs => (v_rules->>'hide_seconds')::int)
       or not exists (select 1 from unnest(v_hiders) x where not g.spots ? x::text) then
      foreach h in array v_hiders loop
        if not g.spots ? h::text then g.spots := g.spots || jsonb_build_object(h::text, floor(random() * v_spots)::int); end if;
      end loop;
      update hide_games set spots = g.spots, phase = 'seek', phase_started_at = now() where room_id = p_room;
    end if;
  elsif g.phase = 'seek' then
    v_all_caught := not exists (select 1 from unnest(v_hiders) x where not g.caught @> to_jsonb(x::text));
    if not v_seeker_here or v_all_caught
       or jsonb_array_length(g.searched) >= (v_rules->>'searches')::int
       or now() > g.phase_started_at + make_interval(secs => (v_rules->>'seek_seconds')::int) then
      if v_seeker_here then
        update room_players set score = score + 2 * jsonb_array_length(g.caught) + case when v_all_caught then 2 else 0 end
         where room_id = p_room and child_id = v_seeker;
      end if;
      update room_players set score = score + 2
       where room_id = p_room and child_id = any (v_hiders) and not g.caught @> to_jsonb(child_id::text);
      update hide_games set phase = 'reveal', phase_started_at = now() where room_id = p_room;
    end if;
  elsif now() > g.phase_started_at + make_interval(secs => (v_rules->>'reveal_seconds')::int) then
    if g.round + 1 >= jsonb_array_length(g.order_ids) then
      update hide_games set phase = 'done', phase_started_at = now() where room_id = p_room;
      update rooms set state = 'done' where id = p_room;
    else
      update hide_games set round = round + 1, phase = 'hide', phase_started_at = now(), spots = '{}', caught = '[]', found = '[]', searched = '[]', sneaked = '[]'
       where room_id = p_room;
    end if;
  end if;
end $$;

-- A hider picks a spot while hiding, or sneaks to a new one (once a round) while the seeker is searching.
create function public.hide_move(p_spot int) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room uuid := hide_room();
  g hide_games;
begin
  if v_room is null then raise exception 'you are not in a game'; end if;
  perform hide_tick(v_room);
  select * into g from hide_games where room_id = v_room for update;
  if p_spot is null or p_spot < 0 or p_spot >= (setting('hide_rules')->>'spots')::int then raise exception 'pick a spot in the hall'; end if;
  if (g.order_ids ->> g.round)::uuid = me then raise exception 'you are the seeker'; end if;
  if g.phase = 'hide' then
    update hide_games set spots = spots || jsonb_build_object(me::text, p_spot) where room_id = v_room;
  elsif g.phase = 'seek' then
    if g.caught @> to_jsonb(me::text) then raise exception 'you were found'; end if;
    if g.sneaked @> to_jsonb(me::text) then raise exception 'you already sneaked'; end if;
    if (g.spots ->> me::text)::int = p_spot then raise exception 'pick a different spot'; end if;
    update hide_games set spots = spots || jsonb_build_object(me::text, p_spot), sneaked = sneaked || to_jsonb(me::text) where room_id = v_room;
  else
    raise exception 'not now';
  end if;
  perform hide_tick(v_room);
end $$;

create function public.hide_search(p_spot int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room uuid := hide_room();
  g hide_games;
  h text;
  v_n int := 0;
begin
  if v_room is null then raise exception 'you are not in a game'; end if;
  perform hide_tick(v_room);
  select * into g from hide_games where room_id = v_room for update;
  if g.phase <> 'seek' or (g.order_ids ->> g.round)::uuid <> me then raise exception 'it is not your search'; end if;
  if p_spot is null or p_spot < 0 or p_spot >= (setting('hide_rules')->>'spots')::int then raise exception 'pick a spot in the hall'; end if;
  if g.searched @> to_jsonb(p_spot) then raise exception 'you already checked there'; end if;
  for h in select k from jsonb_object_keys(g.spots) k loop
    if (g.spots ->> h)::int = p_spot and not g.caught @> to_jsonb(h) then
      g.caught := g.caught || to_jsonb(h);
      g.found := g.found || jsonb_build_object('spot', p_spot, 'id', h);
      v_n := v_n + 1;
    end if;
  end loop;
  update hide_games set searched = searched || to_jsonb(p_spot), caught = g.caught, found = g.found where room_id = v_room;
  perform hide_tick(v_room);
  return jsonb_build_object('found', v_n);
end $$;

create function public.hide_view(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room rooms;
  g hide_games;
  v_rules jsonb := setting('hide_rules');
  v_seeker uuid;
  v_secs int;
begin
  select * into v_room from rooms where code = upper(trim(p_code)) and game = 'hide-seek' order by created_at desc limit 1;
  if v_room.id is null or not exists (select 1 from room_players where room_id = v_room.id and child_id = me) then
    raise exception 'you are not in that room';
  end if;
  if v_room.state not in ('playing', 'done') then return jsonb_build_object('state', v_room.state); end if;
  if v_room.state = 'playing' then perform hide_tick(v_room.id); end if;
  select * into v_room from rooms where id = v_room.id;
  select * into g from hide_games where room_id = v_room.id;
  v_seeker := (g.order_ids ->> least(g.round, jsonb_array_length(g.order_ids) - 1))::uuid;
  v_secs := case g.phase when 'hide' then (v_rules->>'hide_seconds')::int when 'seek' then (v_rules->>'seek_seconds')::int
                         when 'reveal' then (v_rules->>'reveal_seconds')::int else 0 end;
  return jsonb_build_object(
    'state', v_room.state, 'phase', g.phase, 'round', g.round, 'rounds', jsonb_array_length(g.order_ids),
    'seconds_left', greatest(0, ceil(extract(epoch from g.phase_started_at + make_interval(secs => v_secs) - now())))::int,
    'seconds_total', v_secs, 'layout', g.layout,
    'seeker', v_seeker = me, 'searches_left', greatest(0, (v_rules->>'searches')::int - jsonb_array_length(g.searched)),
    'searched', g.searched,
    'found', coalesce((select jsonb_agg(jsonb_build_object('spot', (f->>'spot')::int, 'name', h.display_name))
                         from jsonb_array_elements(g.found) f join heroes h on h.id = (f->>'id')::uuid), '[]'::jsonb),
    'my_spot', case when v_seeker <> me then (g.spots ->> me::text)::int end,
    'me_caught', g.caught @> to_jsonb(me::text),
    'can_sneak', v_seeker <> me and g.phase = 'seek' and not g.sneaked @> to_jsonb(me::text) and not g.caught @> to_jsonb(me::text),
    'hiders', case when g.phase in ('reveal', 'done') then
        (select coalesce(jsonb_agg(jsonb_build_object('name', h.display_name, 'spot', (g.spots ->> k)::int, 'caught', g.caught @> to_jsonb(k))), '[]'::jsonb)
           from jsonb_object_keys(g.spots) k join heroes h on h.id = k::uuid) end,
    'players', (select jsonb_agg(jsonb_build_object('i', o.i - 1, 'name', h.display_name, 'starter', h.starter_hero, 'me', h.id = me,
                  'score', p.score, 'seeker', h.id = v_seeker and g.phase <> 'done', 'left', p.left_at is not null) order by o.i)
                from jsonb_array_elements_text(g.order_ids) with ordinality o(id, i)
                join heroes h on h.id = o.id::uuid
                join room_players p on p.room_id = v_room.id and p.child_id = h.id));
end $$;

revoke execute on function public.hide_deal(uuid), public.hide_room(), public.hide_tick(uuid) from public, anon, authenticated;
revoke execute on function public.hide_move(int), public.hide_search(int), public.hide_view(text) from public, anon;
grant execute on function public.hide_move(int), public.hide_search(int), public.hide_view(text) to authenticated;

create or replace function public.room_create(p_game text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_grade smallint;
  v_code text;
  v_id uuid;
  v_try int := 0;
begin
  if p_game not in ('trivia-clash', 'odin', 'shadow-signal', 'squad-drawing', 'escape-nexus', 'hide-seek') then raise exception 'unknown game'; end if;
  if my_room() is not null then raise exception 'leave your room first'; end if;
  select grade into v_grade from heroes where id = me;
  loop
    v_code := (select string_agg(substr('ABCDEFGHJKLMNPRSTUVWXYZ', 1 + floor(random() * 23)::int, 1), '') from generate_series(1, 4));
    begin
      insert into rooms (code, game, host, grade) values (v_code, p_game, me, v_grade) returning id into v_id;
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 20 then raise exception 'try again'; end if;
    end;
  end loop;
  insert into room_players (room_id, child_id) values (v_id, me);
  return v_code;
end $$;

create or replace function public.room_start() returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room rooms;
  v_rules jsonb := setting('room_rules');
  v_n int;
  v_picked text[];
begin
  select r.* into v_room from rooms r where r.host = me and r.state = 'lobby' for update;
  if v_room.id is null then raise exception 'you are not hosting a room'; end if;
  select count(*) into v_n from room_players where room_id = v_room.id and left_at is null;
  if v_n < (v_rules->>'min_players')::int then raise exception 'you need at least 2 players'; end if;

  if v_room.game = 'hide-seek' then
    perform hide_deal(v_room.id);
    update rooms set state = 'playing', phase = 'play', idx = 0, phase_started_at = now() where id = v_room.id;
    return;
  end if;
  if v_room.game = 'escape-nexus' then
    perform nexus_deal(v_room.id);
    update rooms set state = 'playing', phase = 'play', idx = 0, phase_started_at = now() where id = v_room.id;
    return;
  end if;
  if v_room.game = 'squad-drawing' then
    perform drawing_deal(v_room.id);
    update rooms set state = 'playing', phase = 'play', idx = 0, phase_started_at = now() where id = v_room.id;
    return;
  end if;
  if v_room.game = 'shadow-signal' then
    perform shadow_deal(v_room.id);
    update rooms set state = 'playing', phase = 'play', idx = 0, phase_started_at = now() where id = v_room.id;
    return;
  end if;
  if v_room.game = 'odin' then
    perform odin_deal(v_room.id);
    update rooms set state = 'playing', phase = 'play', idx = 0, phase_started_at = now() where id = v_room.id;
    return;
  end if;

  select array_agg(id) into v_picked from (
    select q.id from questions q
     where q.active and q.grade = v_room.grade
       and not exists (select 1 from question_history h join room_players p on p.child_id = h.child_id
                        where p.room_id = v_room.id and p.left_at is null and h.question_id = q.id)
     order by random() limit (v_rules->>'questions')::int) s;
  if coalesce(array_length(v_picked, 1), 0) < (v_rules->>'questions')::int then raise exception 'not enough fresh questions'; end if;

  insert into room_questions (room_id, idx, question_id, seconds)
  select v_room.id, t.i - 1, t.id,
         case when position(E'\n\n' in (select prompt from questions where id = t.id)) > 0
              then (v_rules->>'reading_seconds')::int else (v_rules->>'seconds')::int end
    from unnest(v_picked) with ordinality t(id, i);
  insert into question_history (child_id, question_id)
  select p.child_id, q from room_players p, unnest(v_picked) q where p.room_id = v_room.id and p.left_at is null
  on conflict do nothing;
  update rooms set state = 'playing', phase = 'question', idx = 0, phase_started_at = now() where id = v_room.id;
end $$;
