-- Classroom mode: a teacher launches a live quiz battle or a class boss battle, the class joins from their own
-- screens (Chromebooks), and the server runs the questions, timing and scores. Learning only. Everyone in the
-- class plays together; rewards count toward the weekly Class cap (source class_mission).
insert into public.app_settings (key, value) values
  ('class_live', '{"seconds": 20, "reading_seconds": 40, "reveal_seconds": 5, "quiz_max_coins": 25, "boss_win_coins": 30, "boss_try_coins": 10, "xp": 10, "boss_hp_per_answer": 9}')
on conflict (key) do nothing;

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  kind text not null check (kind in ('quiz', 'boss')),
  code text not null,
  subject text not null default 'mixed' check (subject in ('mixed', 'math', 'vocab', 'reading', 'science')),
  mission_id uuid references public.class_missions (id),
  question_count int not null check (question_count between 3 and 20),
  state text not null default 'lobby' check (state in ('lobby', 'playing', 'done', 'closed')),
  phase text not null default 'question' check (phase in ('question', 'reveal')),
  idx int not null default 0,
  phase_started_at timestamptz not null default now(),
  boss_id text references public.raid_bosses (id),
  boss_max int not null default 0,
  boss_hp int not null default 0,
  rewarded boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index class_sessions_open_code_idx on public.class_sessions (code) where state in ('lobby', 'playing');
create unique index class_sessions_open_class_idx on public.class_sessions (class_id) where state in ('lobby', 'playing');

create table public.class_session_players (
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  child_id uuid not null references public.heroes (id) on delete cascade,
  score int not null default 0,
  correct int not null default 0,
  answered int not null default 0,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (session_id, child_id)
);
create index class_session_players_child_idx on public.class_session_players (child_id) where left_at is null;

create table public.class_session_questions (
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  idx int not null,
  question_id text references public.questions (id),
  mission_id uuid references public.class_missions (id),
  q_idx int,
  seconds int not null,
  primary key (session_id, idx),
  check ((question_id is not null) <> (mission_id is not null))
);

create table public.class_session_answers (
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  idx int not null,
  child_id uuid not null references public.heroes (id) on delete cascade,
  choice int not null,
  correct boolean not null,
  points int not null default 0,
  damage int not null default 0,
  answered_at timestamptz not null default now(),
  primary key (session_id, idx, child_id)
);

alter table public.class_sessions enable row level security;
alter table public.class_session_players enable row level security;
alter table public.class_session_questions enable row level security;
alter table public.class_session_answers enable row level security;
revoke all on public.class_sessions, public.class_session_players, public.class_session_questions, public.class_session_answers from anon, authenticated;

-- What one question looks like: prompt, choices, right answer and explanation, from the bank or from a class quiz.
create function public.class_live_q(p_session uuid, p_idx int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q class_session_questions; qq questions; k question_keys; m class_missions; mk class_mission_keys;
begin
  select * into q from class_session_questions where session_id = p_session and idx = p_idx;
  if q.session_id is null then return null; end if;
  if q.question_id is not null then
    select * into qq from questions where id = q.question_id;
    select * into k from question_keys where question_id = q.question_id;
    return jsonb_build_object('prompt', qq.prompt, 'choices', qq.choices, 'answer', k.answer, 'explanation', k.explanation, 'seconds', q.seconds);
  end if;
  select * into m from class_missions where id = q.mission_id;
  select * into mk from class_mission_keys where mission_id = q.mission_id;
  return jsonb_build_object('prompt', (m.questions -> q.q_idx ->> 'prompt'), 'choices', (m.questions -> q.q_idx -> 'choices'),
    'answer', (mk.answers ->> q.q_idx)::int, 'explanation', mk.explanations ->> q.q_idx, 'seconds', q.seconds);
end $$;
revoke execute on function public.class_live_q(uuid, int) from public, anon, authenticated;

-- Teacher: open a lobby for one of their classes. Any lobby or game already open for that class is closed first.
create function public.class_live_create(p_class uuid, p_kind text, p_subject text, p_count int, p_mission uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_code text; v_id uuid; v_try int := 0; v_n int := p_count; v_boss text;
begin
  if not teaches_class(p_class) then raise exception 'not your class'; end if;
  if p_kind not in ('quiz', 'boss') then raise exception 'pick quiz or boss'; end if;
  if p_subject not in ('mixed', 'math', 'vocab', 'reading', 'science') then raise exception 'pick a subject'; end if;
  if p_mission is not null then
    if not exists (select 1 from class_missions where id = p_mission and class_id = p_class) then raise exception 'that quiz is not in this class'; end if;
    v_n := jsonb_array_length((select questions from class_missions where id = p_mission));
  end if;
  if v_n not between 3 and 20 then raise exception 'pick 3 to 20 questions'; end if;
  update class_sessions set state = 'closed' where class_id = p_class and state in ('lobby', 'playing');
  select id into v_boss from raid_bosses order by random() limit 1;
  loop
    v_code := (select string_agg(substr('ABCDEFGHJKLMNPRSTUVWXYZ', 1 + floor(random() * 23)::int, 1), '') from generate_series(1, 4));
    begin
      insert into class_sessions (class_id, kind, code, subject, mission_id, question_count, boss_id)
      values (p_class, p_kind, v_code, p_subject, p_mission, v_n, case when p_kind = 'boss' then v_boss end) returning id into v_id;
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 20 then raise exception 'try again'; end if;
    end;
  end loop;
  return v_code;
end $$;

-- Student: the live session open for my class right now, if any, so Home can offer a one-tap join.
create function public.class_live_open() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('code', s.code, 'kind', s.kind, 'state', s.state, 'joined', exists (
           select 1 from class_session_players p where p.session_id = s.id and p.child_id = auth.uid() and p.left_at is null))
    from class_members m join class_sessions s on s.class_id = m.class_id and s.state in ('lobby', 'playing')
   where m.child_id = auth.uid() limit 1
$$;

create function public.class_live_join(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero(); s class_sessions;
begin
  select * into s from class_sessions where code = upper(trim(p_code)) and state in ('lobby', 'playing');
  if s.id is null or not exists (select 1 from class_members where class_id = s.class_id and child_id = me) then
    raise exception 'no live class with that code';
  end if;
  if exists (select 1 from class_session_players where session_id = s.id and child_id = me) then
    update class_session_players set left_at = null where session_id = s.id and child_id = me;
    return s.code;
  end if;
  if s.state <> 'lobby' then raise exception 'that game already started'; end if;
  insert into class_session_players (session_id, child_id) values (s.id, me);
  return s.code;
end $$;

create function public.class_live_leave() returns void
language sql security definer set search_path = public as $$
  update class_session_players p set left_at = now() from class_sessions s
   where p.session_id = s.id and p.child_id = auth.uid() and p.left_at is null and s.state in ('lobby', 'playing')
$$;

-- Teacher: start. Questions come from the bank (this class's grade, fresh random picks) or from a class quiz.
create function public.class_live_start(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare s class_sessions; v_rules jsonb := setting('class_live'); v_n int; v_players int; v_picked text[]; v_grade smallint;
begin
  select * into s from class_sessions where code = upper(trim(p_code)) and state = 'lobby' for update;
  if s.id is null or not teaches_class(s.class_id) then raise exception 'no lobby with that code'; end if;
  select count(*) into v_players from class_session_players where session_id = s.id and left_at is null;
  if v_players < 1 then raise exception 'wait for at least one student'; end if;
  select grade into v_grade from classes where id = s.class_id;
  if s.mission_id is not null then
    insert into class_session_questions (session_id, idx, mission_id, q_idx, seconds)
    select s.id, i, s.mission_id, i, case when length(coalesce((select passage from class_missions where id = s.mission_id), '')) > 0
                                         then (v_rules->>'reading_seconds')::int else (v_rules->>'seconds')::int end
      from generate_series(0, s.question_count - 1) i;
  else
    select array_agg(id) into v_picked from (
      select q.id from questions q
       where q.active and q.grade = v_grade and (s.subject = 'mixed' or q.subject::text = s.subject)
       order by random() limit s.question_count) x;
    if coalesce(array_length(v_picked, 1), 0) < s.question_count then raise exception 'not enough questions for that choice'; end if;
    insert into class_session_questions (session_id, idx, question_id, seconds)
    select s.id, t.i - 1, t.id,
           case when position(E'\n\n' in (select prompt from questions where id = t.id)) > 0
                then (v_rules->>'reading_seconds')::int else (v_rules->>'seconds')::int end
      from unnest(v_picked) with ordinality t(id, i);
  end if;
  v_n := s.question_count;
  update class_sessions set state = 'playing', phase = 'question', idx = 0, phase_started_at = now(),
         boss_max = case when kind = 'boss' then v_players * v_n * (v_rules->>'boss_hp_per_answer')::int else 0 end,
         boss_hp = case when kind = 'boss' then v_players * v_n * (v_rules->>'boss_hp_per_answer')::int else 0 end
   where id = s.id;
end $$;

-- Pays everyone once when the game ends. Quiz: 5 coins for taking part (half the questions) plus up to 20 for accuracy.
-- Boss: a bigger prize when the class wins, a smaller one for trying. Counts toward the weekly Class cap.
create function public.class_live_finish(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s class_sessions; v_rules jsonb := setting('class_live'); p record; v_coins int; v_won boolean;
begin
  select * into s from class_sessions where id = p_session for update;
  if s.rewarded then return; end if;
  v_won := s.kind = 'boss' and s.boss_hp <= 0;
  for p in select * from class_session_players where session_id = p_session loop
    v_coins := 0;
    if p.answered * 2 >= s.question_count then
      if s.kind = 'quiz' then
        v_coins := 5 + round(((v_rules->>'quiz_max_coins')::int - 5) * p.correct::numeric / s.question_count)::int;
      else
        v_coins := case when v_won then (v_rules->>'boss_win_coins')::int else (v_rules->>'boss_try_coins')::int end;
      end if;
    end if;
    if v_coins > 0 then
      perform award(p.child_id, 'coins', v_coins, 'class_mission', 'Live class', 'live:' || p_session);
      perform award(p.child_id, 'xp', (v_rules->>'xp')::int, 'class_mission', 'Live class', 'live:' || p_session);
    end if;
  end loop;
  update class_sessions set rewarded = true where id = p_session;
end $$;
revoke execute on function public.class_live_finish(uuid) from public, anon, authenticated;

create function public.class_live_tick(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s class_sessions; v_rules jsonb := setting('class_live'); v_secs int; v_active int; v_answered int; v_total int;
begin
  select * into s from class_sessions where id = p_session for update;
  if s.state <> 'playing' then return; end if;
  select count(*) into v_total from class_session_questions where session_id = p_session;
  loop
    select seconds into v_secs from class_session_questions where session_id = p_session and idx = s.idx;
    select count(*) into v_active from class_session_players where session_id = p_session and left_at is null;
    select count(*) into v_answered from class_session_answers a join class_session_players p on p.session_id = a.session_id and p.child_id = a.child_id
     where a.session_id = p_session and a.idx = s.idx and p.left_at is null;
    if s.phase = 'question' and (now() >= s.phase_started_at + make_interval(secs => v_secs) or (v_active > 0 and v_answered >= v_active)) then
      update class_sessions set phase = 'reveal', phase_started_at = now() where id = p_session returning * into s;
    elsif s.phase = 'reveal' and now() >= s.phase_started_at + make_interval(secs => (v_rules->>'reveal_seconds')::int) then
      if s.idx + 1 >= v_total or (s.kind = 'boss' and s.boss_hp <= 0) then
        update class_sessions set state = 'done' where id = p_session returning * into s;
        perform class_live_finish(p_session);
      else
        update class_sessions set phase = 'question', idx = idx + 1, phase_started_at = now() where id = p_session returning * into s;
      end if;
    else
      exit;
    end if;
    exit when s.state <> 'playing';
  end loop;
end $$;
revoke execute on function public.class_live_tick(uuid) from public, anon, authenticated;

-- Teacher: move on now (ends the question, or skips the reveal), or close the game.
create function public.class_live_skip(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare s class_sessions;
begin
  select * into s from class_sessions where code = upper(trim(p_code)) and state = 'playing' for update;
  if s.id is null or not teaches_class(s.class_id) then raise exception 'no game with that code'; end if;
  update class_sessions set phase_started_at = now() - interval '1 day' where id = s.id;
  perform class_live_tick(s.id);
end $$;

create function public.class_live_end(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare s class_sessions;
begin
  select * into s from class_sessions where code = upper(trim(p_code)) and state in ('lobby', 'playing', 'done');
  if s.id is null or not teaches_class(s.class_id) then raise exception 'no game with that code'; end if;
  if s.state = 'playing' then
    update class_sessions set state = 'done' where id = s.id;
    perform class_live_finish(s.id);
  end if;
  update class_sessions set state = 'closed' where id = s.id;
end $$;

create function public.class_live_answer(p_choice int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero(); s class_sessions; q jsonb; v_right boolean; v_points int := 0; v_damage int := 0; v_left numeric;
begin
  select cs.* into s from class_session_players p join class_sessions cs on cs.id = p.session_id
   where p.child_id = me and p.left_at is null and cs.state = 'playing';
  if s.id is null then raise exception 'you are not in a live game'; end if;
  perform class_live_tick(s.id);
  select * into s from class_sessions where id = s.id;
  if s.state <> 'playing' or s.phase <> 'question' then return jsonb_build_object('late', true); end if;
  if exists (select 1 from class_session_answers where session_id = s.id and idx = s.idx and child_id = me) then
    return jsonb_build_object('repeat', true);
  end if;
  q := class_live_q(s.id, s.idx);
  if p_choice is null or p_choice not between 0 and jsonb_array_length(q->'choices') - 1 then raise exception 'pick one of the choices'; end if;
  v_right := p_choice = (q->>'answer')::int;
  if v_right then
    v_left := greatest(0, 1 - extract(epoch from now() - s.phase_started_at) / (q->>'seconds')::numeric);
    v_points := 100 + floor(50 * v_left)::int;
    if s.kind = 'boss' then v_damage := 10 + floor(10 * v_left)::int; end if;
  end if;
  insert into class_session_answers (session_id, idx, child_id, choice, correct, points, damage)
  values (s.id, s.idx, me, p_choice, v_right, v_points, v_damage);
  update class_session_players set score = score + v_points, answered = answered + 1, correct = correct + case when v_right then 1 else 0 end
   where session_id = s.id and child_id = me;
  if v_damage > 0 then update class_sessions set boss_hp = greatest(0, boss_hp - v_damage) where id = s.id; end if;
  perform class_live_tick(s.id);
  return jsonb_build_object('accepted', true);
end $$;

-- One state function for the teacher's big screen and for students. Teachers see everything; a student sees their own
-- answer and, after the reveal, the right answer.
create function public.class_live_state(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s class_sessions; v_rules jsonb := setting('class_live'); v_teacher boolean; v_q jsonb; v_out jsonb; v_boss raid_bosses; v_me uuid := auth.uid();
begin
  select * into s from class_sessions where code = upper(trim(p_code)) order by created_at desc limit 1;
  if s.id is null then raise exception 'no live class with that code'; end if;
  v_teacher := teaches_class(s.class_id);
  if not v_teacher and not exists (select 1 from class_session_players where session_id = s.id and child_id = v_me) then
    raise exception 'you are not in that game';
  end if;
  perform class_live_tick(s.id);
  select * into s from class_sessions where id = s.id;
  select * into v_boss from raid_bosses where id = s.boss_id;

  v_out := jsonb_build_object(
    'code', s.code, 'role', case when v_teacher then 'teacher' else 'student' end, 'kind', s.kind, 'state', s.state, 'phase', s.phase, 'idx', s.idx,
    'total', s.question_count, 'class_name', (select name from classes where id = s.class_id),
    'boss', case when s.kind = 'boss' then jsonb_build_object('name', v_boss.name, 'icon', v_boss.icon, 'hp', s.boss_hp, 'max', s.boss_max) end,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
        'name', h.display_name, 'starter', h.starter_hero, 'score', p.score, 'correct', p.correct, 'me', p.child_id = v_me,
        'answered', exists (select 1 from class_session_answers a where a.session_id = s.id and a.idx = s.idx and a.child_id = p.child_id))
        order by p.score desc, h.display_name)
      from class_session_players p join heroes h on h.id = p.child_id where p.session_id = s.id and p.left_at is null), '[]'::jsonb));

  if s.state = 'playing' then
    v_q := class_live_q(s.id, s.idx);
    v_out := v_out || jsonb_build_object(
      'seconds', (v_q->>'seconds')::int,
      'seconds_left', greatest(0, ceil(case when s.phase = 'question'
          then extract(epoch from s.phase_started_at + make_interval(secs => (v_q->>'seconds')::int) - now())
          else extract(epoch from s.phase_started_at + make_interval(secs => (v_rules->>'reveal_seconds')::int) - now()) end))::int,
      'question', jsonb_build_object('prompt', v_q->>'prompt', 'choices', v_q->'choices'),
      'my_choice', (select choice from class_session_answers where session_id = s.id and idx = s.idx and child_id = v_me),
      'answered', (select count(*) from class_session_answers a join class_session_players p on p.session_id = a.session_id and p.child_id = a.child_id
                    where a.session_id = s.id and a.idx = s.idx and p.left_at is null));
    if s.phase = 'reveal' then
      v_out := v_out || jsonb_build_object('right_choice', (v_q->>'answer')::int, 'explanation', v_q->>'explanation',
        'my_points', coalesce((select points from class_session_answers where session_id = s.id and idx = s.idx and child_id = v_me), 0),
        'my_damage', coalesce((select damage from class_session_answers where session_id = s.id and idx = s.idx and child_id = v_me), 0),
        'class_damage', (select coalesce(sum(damage), 0) from class_session_answers where session_id = s.id and idx = s.idx),
        'choice_counts', (select coalesce(jsonb_object_agg(choice::text, n), '{}'::jsonb) from (
            select choice, count(*) n from class_session_answers where session_id = s.id and idx = s.idx group by choice) c));
    end if;
  end if;
  if s.state in ('done', 'closed') and not v_teacher then
    v_out := v_out || jsonb_build_object('my_reward', coalesce((select sum(amount) from ledger_entries
        where child_id = v_me and currency = 'coins' and idempotency_key = 'live:' || s.id), 0)::int);
  end if;
  return v_out;
end $$;

revoke execute on function public.class_live_create(uuid, text, text, int, uuid), public.class_live_open(), public.class_live_join(text), public.class_live_leave(),
  public.class_live_start(text), public.class_live_skip(text), public.class_live_end(text), public.class_live_answer(int), public.class_live_state(text) from public, anon;
grant execute on function public.class_live_create(uuid, text, text, int, uuid), public.class_live_open(), public.class_live_join(text), public.class_live_leave(),
  public.class_live_start(text), public.class_live_skip(text), public.class_live_end(text), public.class_live_answer(int), public.class_live_state(text) to authenticated;
