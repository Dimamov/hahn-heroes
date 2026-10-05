-- Escape the Nexus: a cooperative escape. Every hero in the room has their own seal: three questions picked
-- fresh for them. The whole squad escapes only when every seal is broken before the shared clock runs out.
-- A wrong answer costs the squad time. A hero who finished early can boost a teammate (one wrong choice
-- disappears from their question). Answers are real learning answers, so they count toward progress.

alter table public.rooms drop constraint rooms_game_check;
alter table public.rooms add constraint rooms_game_check check (game in ('trivia-clash', 'odin', 'shadow-signal', 'squad-drawing', 'escape-nexus'));

create table public.nexus_games (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  started_at timestamptz not null default now(),
  base_seconds int not null,
  penalty_seconds int not null default 0,
  outcome text not null default 'play' check (outcome in ('play', 'won', 'lost')),
  order_ids jsonb not null
);
create table public.nexus_seals (
  room_id uuid not null references public.rooms (id) on delete cascade,
  child_id uuid not null references public.heroes (id) on delete cascade,
  qids jsonb not null,
  pos int not null default 0,
  solved int not null default 0,
  need int not null default 3,
  wrong int not null default 0,
  hidden jsonb not null default '[]',
  boost_used boolean not null default false,
  primary key (room_id, child_id)
);
alter table public.nexus_games enable row level security;
alter table public.nexus_seals enable row level security;
revoke all on public.nexus_games, public.nexus_seals from anon, authenticated;

insert into public.app_settings (key, value) values
  ('nexus_rules', '{"seals": 3, "spares": 3, "base_seconds": 60, "per_player_seconds": 50, "wrong_penalty": 10, "exhausted_penalty": 30}') on conflict (key) do nothing;

-- Called by room_start for Escape the Nexus rooms. Questions are fresh for each hero and marked as served.
create function public.nexus_deal(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_rules jsonb := setting('nexus_rules');
  v_grade smallint;
  p uuid;
  v_picked jsonb;
  v_order jsonb;
  v_n int;
begin
  select grade into v_grade from rooms where id = p_room;
  select jsonb_agg(child_id order by joined_at) into v_order from room_players where room_id = p_room and left_at is null;
  v_n := jsonb_array_length(v_order);
  for p in select (jsonb_array_elements_text(v_order))::uuid loop
    select coalesce(jsonb_agg(id), '[]'::jsonb) into v_picked from (
      select q.id from questions q
       where q.active and q.grade = v_grade
         and not exists (select 1 from question_history h where h.child_id = p and h.question_id = q.id)
       order by random() limit (v_rules->>'seals')::int + (v_rules->>'spares')::int) s;
    if jsonb_array_length(v_picked) < (v_rules->>'seals')::int then raise exception 'not enough fresh questions'; end if;
    insert into question_history (child_id, question_id)
    select p, (jsonb_array_elements_text(v_picked)) on conflict do nothing;
    insert into nexus_seals (room_id, child_id, qids, need) values (p_room, p, v_picked, (v_rules->>'seals')::int);
  end loop;
  insert into nexus_games (room_id, base_seconds, order_ids)
  values (p_room, (v_rules->>'base_seconds')::int + v_n * (v_rules->>'per_player_seconds')::int, v_order);
end $$;

create function public.nexus_room() returns uuid
language sql stable security definer set search_path = public as $$
  select r.id from room_players p join rooms r on r.id = p.room_id
   where p.child_id = auth.uid() and p.left_at is null and r.state = 'playing' and r.game = 'escape-nexus'
$$;

create function public.nexus_tick(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  g nexus_games;
begin
  select * into g from nexus_games where room_id = p_room for update;
  if g.room_id is null or g.outcome <> 'play' then return; end if;
  if not exists (select 1 from nexus_seals s join room_players rp on rp.room_id = s.room_id and rp.child_id = s.child_id
                  where s.room_id = p_room and rp.left_at is null and s.solved < s.need) then
    update nexus_games set outcome = 'won' where room_id = p_room;
    update rooms set state = 'done' where id = p_room;
  elsif (select count(*) from room_players where room_id = p_room and left_at is null) < 2
     or now() > g.started_at + make_interval(secs => g.base_seconds + g.penalty_seconds) then
    update nexus_games set outcome = 'lost' where room_id = p_room;
    update rooms set state = 'done' where id = p_room;
  end if;
end $$;

create function public.nexus_answer(p_choice int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room uuid := nexus_room();
  v_rules jsonb := setting('nexus_rules');
  s nexus_seals;
  g nexus_games;
  v_res jsonb;
  v_qid text;
  v_ok boolean;
  v_left int;
begin
  if v_room is null then raise exception 'you are not in a game'; end if;
  perform nexus_tick(v_room);
  select * into g from nexus_games where room_id = v_room for update;
  if g.outcome <> 'play' then return jsonb_build_object('over', true); end if;
  select * into s from nexus_seals where room_id = v_room and child_id = me for update;
  if s.solved >= s.need then raise exception 'your seal is already open'; end if;
  v_qid := s.qids ->> s.pos;
  v_res := answer_question(v_qid, p_choice);
  v_ok := (v_res ->> 'correct')::boolean;
  if v_ok then
    update nexus_seals set solved = solved + 1, pos = pos + 1, hidden = '[]' where room_id = v_room and child_id = me returning * into s;
  else
    update nexus_seals set wrong = wrong + 1, pos = pos + 1, hidden = '[]' where room_id = v_room and child_id = me returning * into s;
    update nexus_games set penalty_seconds = penalty_seconds + (v_rules->>'wrong_penalty')::int where room_id = v_room;
  end if;
  -- out of questions: the rest of the seal gives way slowly, so nobody can block the squad forever
  if s.solved < s.need and s.pos >= jsonb_array_length(s.qids) then
    v_left := s.need - s.solved;
    update nexus_seals set solved = need where room_id = v_room and child_id = me;
    update nexus_games set penalty_seconds = penalty_seconds + v_left * (v_rules->>'exhausted_penalty')::int where room_id = v_room;
  end if;
  perform nexus_tick(v_room);
  return jsonb_build_object('correct', v_ok, 'right_choice', v_res ->> 'right_choice', 'explanation', v_res ->> 'explanation',
                            'penalty', case when v_ok then 0 else (v_rules->>'wrong_penalty')::int end);
end $$;

-- A hero who has opened their seal makes a teammate's current question easier by removing one wrong choice.
create function public.nexus_boost(p_index int) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room uuid := nexus_room();
  g nexus_games;
  mine nexus_seals;
  theirs nexus_seals;
  v_target uuid;
  v_qid text;
  v_right int;
  v_n int;
  v_pick int;
begin
  if v_room is null then raise exception 'you are not in a game'; end if;
  perform nexus_tick(v_room);
  select * into g from nexus_games where room_id = v_room;
  if g.outcome <> 'play' then raise exception 'the game is over'; end if;
  select * into mine from nexus_seals where room_id = v_room and child_id = me;
  if mine.solved < mine.need then raise exception 'open your own seal first'; end if;
  if mine.boost_used then raise exception 'you already boosted someone'; end if;
  if p_index is null or p_index < 0 or p_index >= jsonb_array_length(g.order_ids) then raise exception 'pick a teammate'; end if;
  v_target := (g.order_ids ->> p_index)::uuid;
  select * into theirs from nexus_seals where room_id = v_room and child_id = v_target;
  if v_target = me or theirs.solved >= theirs.need then raise exception 'pick a teammate who still needs help'; end if;
  v_qid := theirs.qids ->> theirs.pos;
  select answer into v_right from question_keys where question_id = v_qid;
  select jsonb_array_length(choices) into v_n from questions where id = v_qid;
  if jsonb_array_length(theirs.hidden) >= v_n - 2 then raise exception 'that question is already boosted'; end if;
  select c into v_pick from generate_series(0, v_n - 1) c where c <> v_right and not theirs.hidden @> to_jsonb(c) order by random() limit 1;
  update nexus_seals set hidden = hidden || to_jsonb(v_pick) where room_id = v_room and child_id = v_target;
  update nexus_seals set boost_used = true where room_id = v_room and child_id = me;
end $$;

create function public.nexus_view(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room rooms;
  g nexus_games;
  mine nexus_seals;
  v_q questions;
  v_total int;
begin
  select * into v_room from rooms where code = upper(trim(p_code)) and game = 'escape-nexus' order by created_at desc limit 1;
  if v_room.id is null or not exists (select 1 from room_players where room_id = v_room.id and child_id = me) then
    raise exception 'you are not in that room';
  end if;
  if v_room.state not in ('playing', 'done') then return jsonb_build_object('state', v_room.state); end if;
  if v_room.state = 'playing' then perform nexus_tick(v_room.id); end if;
  select * into v_room from rooms where id = v_room.id;
  select * into g from nexus_games where room_id = v_room.id;
  select * into mine from nexus_seals where room_id = v_room.id and child_id = me;
  v_total := g.base_seconds + g.penalty_seconds;
  if mine.solved < mine.need and g.outcome = 'play' then
    select * into v_q from questions where id = mine.qids ->> mine.pos;
  end if;
  return jsonb_build_object(
    'state', v_room.state, 'outcome', g.outcome,
    'seconds_left', greatest(0, ceil(extract(epoch from g.started_at + make_interval(secs => v_total) - now())))::int,
    'seconds_total', v_total, 'penalty', g.penalty_seconds,
    'solved', mine.solved, 'need', mine.need, 'wrong', mine.wrong,
    'question', case when v_q.id is not null then jsonb_build_object('prompt', v_q.prompt, 'choices', v_q.choices, 'hidden', mine.hidden) end,
    'can_boost', mine.solved >= mine.need and not mine.boost_used and g.outcome = 'play',
    'players', (select jsonb_agg(jsonb_build_object('i', o.i - 1, 'name', h.display_name, 'starter', h.starter_hero, 'me', h.id = me,
                  'solved', s.solved, 'need', s.need, 'done', s.solved >= s.need, 'left', rp.left_at is not null) order by o.i)
                from jsonb_array_elements_text(g.order_ids) with ordinality o(id, i)
                join heroes h on h.id = o.id::uuid
                join nexus_seals s on s.room_id = v_room.id and s.child_id = h.id
                join room_players rp on rp.room_id = v_room.id and rp.child_id = h.id));
end $$;

revoke execute on function public.nexus_deal(uuid), public.nexus_room(), public.nexus_tick(uuid) from public, anon, authenticated;
revoke execute on function public.nexus_answer(int), public.nexus_boost(int), public.nexus_view(text) from public, anon;
grant execute on function public.nexus_answer(int), public.nexus_boost(int), public.nexus_view(text) to authenticated;

create or replace function public.room_create(p_game text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_grade smallint;
  v_code text;
  v_id uuid;
  v_try int := 0;
begin
  if p_game not in ('trivia-clash', 'odin', 'shadow-signal', 'squad-drawing', 'escape-nexus') then raise exception 'unknown game'; end if;
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
