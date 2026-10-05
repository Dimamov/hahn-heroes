-- ODIN: the UNO-like card game, run by the server so hands stay secret. Cards are text:
-- colour letter R/B/G/Y then a value (0-9, S skip, R reverse, D draw two), or W wild / W4 wild draw four.

alter table public.rooms drop constraint rooms_game_check;
alter table public.rooms add constraint rooms_game_check check (game in ('trivia-clash', 'odin'));

alter table public.rooms drop constraint rooms_phase_check;
alter table public.rooms add constraint rooms_phase_check check (phase in ('question', 'reveal', 'play'));

create table public.odin_games (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  deck jsonb not null,
  discard jsonb not null,
  color text not null,
  order_ids jsonb not null,
  turn int not null default 0,
  dir int not null default 1,
  turn_started_at timestamptz not null default now(),
  last text not null default '',
  winner uuid references public.heroes (id)
);
create table public.odin_hands (
  room_id uuid not null references public.rooms (id) on delete cascade,
  child_id uuid not null references public.heroes (id) on delete cascade,
  hand jsonb not null default '[]',
  primary key (room_id, child_id)
);
alter table public.odin_games enable row level security;
alter table public.odin_hands enable row level security;
revoke all on public.odin_games, public.odin_hands from anon, authenticated;

insert into public.app_settings (key, value) values ('odin_rules', '{"hand": 7, "turn_seconds": 45}') on conflict (key) do nothing;

create function public.odin_new_deck() returns jsonb
language sql volatile as $$
  select jsonb_agg(c order by random()) from (
    select col || v as c from unnest(array['R','B','G','Y']) col,
      unnest(array['0','1','1','2','2','3','3','4','4','5','5','6','6','7','7','8','8','9','9','S','S','R','R','D','D']) v
    union all select 'W' from generate_series(1, 4)
    union all select 'W4' from generate_series(1, 4)) d
$$;

create function public.odin_playable(p_card text, p_top text, p_color text) returns boolean
language sql immutable as $$
  select left(p_card, 1) = 'W' or left(p_card, 1) = p_color or (left(p_top, 1) <> 'W' and substr(p_card, 2) = substr(p_top, 2))
$$;

-- Takes cards from the deck, reshuffling the discard pile (all but the top card) when it runs out.
create function public.odin_draw(p_room uuid, p_child uuid, p_n int) returns void
language plpgsql security definer set search_path = public as $$
declare
  g odin_games;
  v_taken jsonb;
  v_top jsonb;
begin
  select * into g from odin_games where room_id = p_room for update;
  if jsonb_array_length(g.deck) < p_n then
    v_top := g.discard -> (jsonb_array_length(g.discard) - 1);
    g.deck := g.deck || coalesce((select jsonb_agg(e order by random()) from jsonb_array_elements(g.discard) with ordinality t(e, i) where i < jsonb_array_length(g.discard)), '[]'::jsonb);
    g.discard := jsonb_build_array(v_top);
  end if;
  p_n := least(p_n, jsonb_array_length(g.deck));
  v_taken := coalesce((select jsonb_agg(e order by i) from jsonb_array_elements(g.deck) with ordinality t(e, i) where i <= p_n), '[]'::jsonb);
  update odin_games set deck = coalesce((select jsonb_agg(e order by i) from jsonb_array_elements(g.deck) with ordinality t(e, i) where i > p_n), '[]'::jsonb), discard = g.discard
   where room_id = p_room;
  update odin_hands set hand = hand || v_taken where room_id = p_room and child_id = p_child;
end $$;

-- The index of the player who is next after p_idx, p_steps times, skipping players who left.
create function public.odin_next(p_room uuid, p_order jsonb, p_idx int, p_dir int, p_steps int) returns int
language plpgsql stable security definer set search_path = public as $$
declare
  n int := jsonb_array_length(p_order);
  i int := p_idx;
  s int;
  guard int;
begin
  for s in 1..p_steps loop
    guard := 0;
    loop
      i := ((i + p_dir) % n + n) % n;
      guard := guard + 1;
      exit when guard > n or exists (select 1 from room_players where room_id = p_room and child_id = (p_order ->> i)::uuid and left_at is null);
    end loop;
  end loop;
  return i;
end $$;

-- Called by room_start for ODIN rooms.
create function public.odin_deal(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_rules jsonb := setting('odin_rules');
  v_deck jsonb := odin_new_deck();
  v_order jsonb;
  v_first text;
  v_idx int;
  p uuid;
  k int := 0;
  v_hand int := (v_rules->>'hand')::int;
begin
  select jsonb_agg(child_id order by joined_at) into v_order from room_players where room_id = p_room and left_at is null;
  for p in select (jsonb_array_elements_text(v_order))::uuid loop
    insert into odin_hands (room_id, child_id, hand)
    values (p_room, p, (select jsonb_agg(e order by i) from jsonb_array_elements(v_deck) with ordinality t(e, i) where i > k * v_hand and i <= (k + 1) * v_hand));
    k := k + 1;
  end loop;
  v_deck := (select jsonb_agg(e order by i) from jsonb_array_elements(v_deck) with ordinality t(e, i) where i > k * v_hand);
  -- first card: the first one that is not a wild or action card
  select e #>> '{}', i into v_first, v_idx from jsonb_array_elements(v_deck) with ordinality t(e, i) where e #>> '{}' ~ '^[RBGY][0-9]$' order by i limit 1;
  v_deck := (select jsonb_agg(e order by i) from jsonb_array_elements(v_deck) with ordinality t(e, i) where i <> v_idx);
  insert into odin_games (room_id, deck, discard, color, order_ids) values (p_room, v_deck, jsonb_build_array(v_first), left(v_first, 1), v_order);
end $$;

-- Plays a card, or (with p_card null) draws one and passes.
create function public.odin_move(p_card text, p_color text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room rooms;
  g odin_games;
  v_hand jsonb;
  v_top text;
  v_color text;
  v_idx int;
  v_next int;
  v_victim uuid;
  v_n_active int;
  v_val text;
begin
  select r.* into v_room from room_players p join rooms r on r.id = p.room_id
   where p.child_id = me and p.left_at is null and r.state = 'playing' and r.game = 'odin';
  if v_room.id is null then raise exception 'you are not in a game'; end if;
  select * into g from odin_games where room_id = v_room.id for update;
  if (g.order_ids ->> g.turn)::uuid <> me then raise exception 'it is not your turn'; end if;
  select hand into v_hand from odin_hands where room_id = v_room.id and child_id = me;

  if p_card is null then
    perform odin_draw(v_room.id, me, 1);
    update odin_games set turn = odin_next(v_room.id, g.order_ids, g.turn, g.dir, 1), turn_started_at = now(), last = 'draw:' || me where room_id = v_room.id;
    return;
  end if;

  if not (v_hand ? p_card) then raise exception 'you do not have that card'; end if;
  v_top := g.discard ->> (jsonb_array_length(g.discard) - 1);
  if not odin_playable(p_card, v_top, g.color) then raise exception 'that card does not match'; end if;
  if left(p_card, 1) = 'W' and coalesce(p_color, '') not in ('R', 'B', 'G', 'Y') then raise exception 'pick a colour'; end if;

  v_idx := (select min(i) from jsonb_array_elements_text(v_hand) with ordinality t(e, i) where e = p_card);
  v_hand := coalesce((select jsonb_agg(e order by i) from jsonb_array_elements(v_hand) with ordinality t(e, i) where i <> v_idx), '[]'::jsonb);
  update odin_hands set hand = v_hand where room_id = v_room.id and child_id = me;
  v_color := case when left(p_card, 1) = 'W' then p_color else left(p_card, 1) end;
  v_val := substr(p_card, 2);
  update odin_games set discard = discard || to_jsonb(p_card), color = v_color, last = 'play:' || me || ':' || p_card where room_id = v_room.id;

  if jsonb_array_length(v_hand) = 0 then
    update odin_games set winner = me where room_id = v_room.id;
    update rooms set state = 'done' where id = v_room.id;
    return;
  end if;

  select count(*) into v_n_active from room_players where room_id = v_room.id and left_at is null;
  v_next := odin_next(v_room.id, g.order_ids, g.turn, g.dir, 1);
  if p_card = 'W4' or v_val = 'D' then
    v_victim := (g.order_ids ->> v_next)::uuid;
    perform odin_draw(v_room.id, v_victim, case when p_card = 'W4' then 4 else 2 end);
    v_next := odin_next(v_room.id, g.order_ids, v_next, g.dir, 1);
  elsif v_val = 'S' then
    v_next := odin_next(v_room.id, g.order_ids, v_next, g.dir, 1);
  elsif v_val = 'R' then
    g.dir := -g.dir;
    v_next := odin_next(v_room.id, g.order_ids, g.turn, g.dir, case when v_n_active = 2 then 2 else 1 end);
  end if;
  update odin_games set turn = v_next, dir = g.dir, turn_started_at = now() where room_id = v_room.id;
end $$;

-- What this hero is allowed to see. Moves a stalled turn along first.
create function public.odin_view(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room rooms;
  g odin_games;
  v_secs int := (setting('odin_rules')->>'turn_seconds')::int;
  v_cur uuid;
begin
  select * into v_room from rooms where code = upper(trim(p_code)) and game = 'odin' order by created_at desc limit 1;
  if v_room.id is null or not exists (select 1 from room_players where room_id = v_room.id and child_id = me) then
    raise exception 'you are not in that room';
  end if;
  if v_room.state not in ('playing', 'done') then return jsonb_build_object('state', v_room.state); end if;
  select * into g from odin_games where room_id = v_room.id for update;
  v_cur := (g.order_ids ->> g.turn)::uuid;
  if v_room.state = 'playing' and (select count(*) from room_players where room_id = v_room.id and left_at is null) < 2 then
    update odin_games set winner = (select child_id from room_players where room_id = v_room.id and left_at is null limit 1) where room_id = v_room.id returning * into g;
    update rooms set state = 'done' where id = v_room.id returning * into v_room;
  end if;
  if v_room.state = 'playing' and exists (select 1 from room_players where room_id = v_room.id and child_id = v_cur and left_at is not null) then
    update odin_games set turn = odin_next(v_room.id, g.order_ids, g.turn, g.dir, 1), turn_started_at = now() where room_id = v_room.id returning * into g;
    v_cur := (g.order_ids ->> g.turn)::uuid;
  end if;
  if v_room.state = 'playing' and now() > g.turn_started_at + make_interval(secs => v_secs) then
    perform odin_draw(v_room.id, v_cur, 1);
    update odin_games set turn = odin_next(v_room.id, g.order_ids, g.turn, g.dir, 1), turn_started_at = now(), last = 'timeout:' || v_cur
     where room_id = v_room.id returning * into g;
    v_cur := (g.order_ids ->> g.turn)::uuid;
  end if;
  return jsonb_build_object(
    'state', v_room.state, 'color', g.color, 'dir', g.dir, 'last', g.last,
    'top', g.discard ->> (jsonb_array_length(g.discard) - 1),
    'deck', jsonb_array_length(g.deck),
    'my_turn', v_cur = me and v_room.state = 'playing',
    'seconds_left', greatest(0, ceil(extract(epoch from g.turn_started_at + make_interval(secs => v_secs) - now())))::int,
    'hand', (select hand from odin_hands where room_id = v_room.id and child_id = me),
    'winner', (select h.display_name from heroes h where h.id = g.winner),
    'players', (select jsonb_agg(jsonb_build_object('name', h.display_name, 'starter', h.starter_hero, 'cards', jsonb_array_length(oh.hand),
                  'turn', h.id = v_cur and v_room.state = 'playing', 'me', h.id = me, 'left', rp.left_at is not null) order by o.i)
                from jsonb_array_elements_text(g.order_ids) with ordinality o(id, i)
                join heroes h on h.id = o.id::uuid
                join odin_hands oh on oh.room_id = v_room.id and oh.child_id = h.id
                join room_players rp on rp.room_id = v_room.id and rp.child_id = h.id));
end $$;

revoke execute on function public.odin_new_deck(), public.odin_playable(text, text, text), public.odin_draw(uuid, uuid, int),
  public.odin_next(uuid, jsonb, int, int, int), public.odin_deal(uuid) from public, anon, authenticated;
revoke execute on function public.odin_move(text, text), public.odin_view(text) from public, anon;
grant execute on function public.odin_move(text, text), public.odin_view(text) to authenticated;

create or replace function public.room_create(p_game text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_grade smallint;
  v_code text;
  v_id uuid;
  v_try int := 0;
begin
  if p_game not in ('trivia-clash', 'odin') then raise exception 'unknown game'; end if;
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

create or replace function public.room_tick(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_rules jsonb := setting('room_rules');
  v_secs int;
  v_active int;
  v_answered int;
  v_total int;
begin
  select * into v_room from rooms where id = p_room for update;
  if v_room.state <> 'playing' or v_room.game <> 'trivia-clash' then return; end if;
  select count(*) into v_total from room_questions where room_id = p_room;
  loop
    select seconds into v_secs from room_questions where room_id = p_room and idx = v_room.idx;
    select count(*) into v_active from room_players where room_id = p_room and left_at is null;
    select count(*) into v_answered from room_answers a join room_players p on p.room_id = a.room_id and p.child_id = a.child_id
     where a.room_id = p_room and a.idx = v_room.idx and p.left_at is null;
    if v_room.phase = 'question' and (now() >= v_room.phase_started_at + make_interval(secs => v_secs) or v_answered >= v_active) then
      update rooms set phase = 'reveal', phase_started_at = now() where id = p_room returning * into v_room;
    elsif v_room.phase = 'reveal' and now() >= v_room.phase_started_at + make_interval(secs => (v_rules->>'reveal_seconds')::int) then
      if v_room.idx + 1 >= v_total then
        update rooms set state = 'done' where id = p_room returning * into v_room;
      else
        update rooms set phase = 'question', idx = idx + 1, phase_started_at = now() where id = p_room returning * into v_room;
      end if;
    else
      exit;
    end if;
    exit when v_room.state <> 'playing';
  end loop;
end $$;

create or replace function public.room_answer(p_choice int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room rooms;
  v_q room_questions;
  v_res jsonb;
  v_points int := 0;
  v_left numeric;
begin
  select r.* into v_room from room_players p join rooms r on r.id = p.room_id
   where p.child_id = me and p.left_at is null and r.state = 'playing';
  if v_room.id is null or v_room.game <> 'trivia-clash' then raise exception 'you are not in a game'; end if;
  perform room_tick(v_room.id);
  select * into v_room from rooms where id = v_room.id;
  if v_room.state <> 'playing' or v_room.phase <> 'question' then return jsonb_build_object('late', true); end if;
  select * into v_q from room_questions where room_id = v_room.id and idx = v_room.idx;
  if exists (select 1 from room_answers where room_id = v_room.id and idx = v_room.idx and child_id = me) then
    return jsonb_build_object('repeat', true);
  end if;
  v_res := answer_question(v_q.question_id, p_choice);
  if (v_res->>'correct')::boolean then
    v_left := greatest(0, 1 - extract(epoch from now() - v_room.phase_started_at) / v_q.seconds);
    v_points := 100 + floor(50 * v_left)::int;
  end if;
  insert into room_answers (room_id, idx, child_id, choice, correct, points)
  values (v_room.id, v_room.idx, me, p_choice, (v_res->>'correct')::boolean, v_points);
  update room_players set score = score + v_points where room_id = v_room.id and child_id = me;
  perform room_tick(v_room.id);
  return jsonb_build_object('accepted', true);
end $$;

create or replace function public.room_state(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room rooms;
  v_q room_questions;
  v_quest questions;
  v_key question_keys;
  v_rules jsonb := setting('room_rules');
  v_out jsonb;
begin
  select * into v_room from rooms where code = upper(trim(p_code)) order by created_at desc limit 1;
  if v_room.id is null or not exists (select 1 from room_players where room_id = v_room.id and child_id = me) then
    raise exception 'you are not in that room';
  end if;
  perform room_tick(v_room.id);
  select * into v_room from rooms where id = v_room.id;

  v_out := jsonb_build_object(
    'code', v_room.code, 'game', v_room.game, 'state', v_room.state, 'phase', v_room.phase, 'idx', v_room.idx,
    'host', v_room.host = me, 'min_players', (v_rules->>'min_players')::int,
    'total', (select count(*) from room_questions where room_id = v_room.id),
    'players', coalesce((select jsonb_agg(jsonb_build_object(
        'name', h.display_name, 'starter', h.starter_hero, 'score', p.score, 'me', p.child_id = me, 'host', p.child_id = v_room.host,
        'answered', exists (select 1 from room_answers a where a.room_id = v_room.id and a.idx = v_room.idx and a.child_id = p.child_id))
        order by p.score desc, h.display_name)
      from room_players p join heroes h on h.id = p.child_id where p.room_id = v_room.id and p.left_at is null), '[]'::jsonb));

  if v_room.state = 'playing' and v_room.game = 'trivia-clash' then
    select * into v_q from room_questions where room_id = v_room.id and idx = v_room.idx;
    select * into v_quest from questions where id = v_q.question_id;
    v_out := v_out || jsonb_build_object(
      'seconds', v_q.seconds,
      'seconds_left', greatest(0, ceil(case when v_room.phase = 'question'
          then extract(epoch from v_room.phase_started_at + make_interval(secs => v_q.seconds) - now())
          else extract(epoch from v_room.phase_started_at + make_interval(secs => (v_rules->>'reveal_seconds')::int) - now()) end))::int,
      'question', jsonb_build_object('prompt', v_quest.prompt, 'choices', v_quest.choices),
      'my_choice', (select choice from room_answers where room_id = v_room.id and idx = v_room.idx and child_id = me));
    if v_room.phase = 'reveal' then
      select * into v_key from question_keys where question_id = v_q.question_id;
      v_out := v_out || jsonb_build_object('right_choice', v_key.answer, 'explanation', v_key.explanation,
        'my_points', coalesce((select points from room_answers where room_id = v_room.id and idx = v_room.idx and child_id = me), 0));
    end if;
  end if;
  return v_out;
end $$;
