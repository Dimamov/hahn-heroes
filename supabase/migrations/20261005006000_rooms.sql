-- Private game rooms, the server-run quiz game "Trivia Clash" first. Heroes join with a 4 letter
-- code, only with their own grade. The server serves questions, times them, grades answers and
-- keeps the score. The app polls room_state() a couple of times a second.

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  game text not null check (game in ('trivia-clash')),
  host uuid not null references public.heroes (id) on delete cascade,
  grade smallint not null check (grade in (5, 6)),
  state text not null default 'lobby' check (state in ('lobby', 'playing', 'done', 'closed')),
  phase text not null default 'question' check (phase in ('question', 'reveal')),
  idx int not null default 0,
  phase_started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index rooms_open_code_idx on public.rooms (code) where state in ('lobby', 'playing');

create table public.room_players (
  room_id uuid not null references public.rooms (id) on delete cascade,
  child_id uuid not null references public.heroes (id) on delete cascade,
  score int not null default 0,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id, child_id)
);
create index room_players_child_idx on public.room_players (child_id) where left_at is null;

create table public.room_questions (
  room_id uuid not null references public.rooms (id) on delete cascade,
  idx int not null,
  question_id text not null references public.questions (id),
  seconds int not null,
  primary key (room_id, idx)
);

create table public.room_answers (
  room_id uuid not null references public.rooms (id) on delete cascade,
  idx int not null,
  child_id uuid not null references public.heroes (id) on delete cascade,
  choice int not null,
  correct boolean not null,
  points int not null default 0,
  answered_at timestamptz not null default now(),
  primary key (room_id, idx, child_id)
);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_questions enable row level security;
alter table public.room_answers enable row level security;
revoke all on public.rooms, public.room_players, public.room_questions, public.room_answers from anon, authenticated;

insert into public.app_settings (key, value) values
  ('room_rules', '{"max_players": 6, "min_players": 2, "questions": 8, "seconds": 20, "reading_seconds": 40, "reveal_seconds": 5}')
on conflict (key) do nothing;

-- The room this hero is in right now (lobby or playing), for rejoining after a reconnect.
create function public.my_room() returns text
language sql stable security definer set search_path = public as $$
  select r.code from room_players p join rooms r on r.id = p.room_id
   where p.child_id = auth.uid() and p.left_at is null and r.state in ('lobby', 'playing')
   order by p.joined_at desc limit 1
$$;

create function public.room_create(p_game text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_grade smallint;
  v_code text;
  v_id uuid;
  v_try int := 0;
begin
  if p_game <> 'trivia-clash' then raise exception 'unknown game'; end if;
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

create function public.room_join(p_code text) returns text
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
  if v_room.id is null then raise exception 'no room with that code'; end if;
  if v_room.state <> 'lobby' then raise exception 'that game already started'; end if;
  if (select grade from heroes where id = me) <> v_room.grade then raise exception 'that room is for the other grade'; end if;
  select count(*) into v_n from room_players where room_id = v_room.id and left_at is null;
  if v_n >= (v_rules->>'max_players')::int then raise exception 'the room is full'; end if;
  insert into room_players (room_id, child_id) values (v_room.id, me)
  on conflict (room_id, child_id) do update set left_at = null;
  return v_room.code;
end $$;

create function public.room_leave() returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room rooms;
begin
  select r.* into v_room from room_players p join rooms r on r.id = p.room_id
   where p.child_id = me and p.left_at is null and r.state in ('lobby', 'playing');
  if v_room.id is null then return; end if;
  update room_players set left_at = now() where room_id = v_room.id and child_id = me;
  if v_room.state = 'lobby' and v_room.host = me then
    update rooms set state = 'closed' where id = v_room.id;
  elsif not exists (select 1 from room_players where room_id = v_room.id and left_at is null) then
    update rooms set state = 'closed' where id = v_room.id;
  end if;
end $$;

-- The host starts the game. Questions are fresh for every player, and are marked as served to
-- all of them so nobody sees them again in practice.
create function public.room_start() returns void
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

-- Moves the game on when time is up or everyone has answered.
create function public.room_tick(p_room uuid) returns void
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
  if v_room.state <> 'playing' then return; end if;
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

create function public.room_answer(p_choice int) returns jsonb
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
  if v_room.id is null then raise exception 'you are not in a game'; end if;
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

create function public.room_state(p_code text) returns jsonb
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

  if v_room.state = 'playing' then
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

revoke execute on function public.room_tick(uuid) from public, anon, authenticated;
revoke execute on function public.my_room(), public.room_create(text), public.room_join(text), public.room_leave(), public.room_start(),
  public.room_answer(int), public.room_state(text) from public, anon;
grant execute on function public.my_room(), public.room_create(text), public.room_join(text), public.room_leave(), public.room_start(),
  public.room_answer(int), public.room_state(text) to authenticated;
