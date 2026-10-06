-- Vocabulary duel: a knockout bracket. Students are paired, each pair answers the same word questions at the same time
-- (best score wins, ties go to the faster one), winners move on, and the class watches the bracket. Learning only.
alter table public.class_sessions drop constraint class_sessions_kind_check;
alter table public.class_sessions add constraint class_sessions_kind_check check (kind in ('quiz', 'boss', 'mystery', 'duel'));

create table public.class_duel_matches (
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  round int not null,
  slot int not null,
  a uuid not null references public.heroes (id),
  b uuid references public.heroes (id),
  a_score int not null default 0,
  b_score int not null default 0,
  winner uuid references public.heroes (id),
  primary key (session_id, round, slot)
);
alter table public.class_duel_matches enable row level security;
revoke all on public.class_duel_matches from anon, authenticated;

-- Sets up one round: random pairs (an odd one out gets a bye) and fresh word questions that have not been used in this game.
create function public.class_duel_make_round(p_session uuid, p_round int, p_players uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare s class_sessions; v_rules jsonb := setting('class_live'); v_arr uuid[]; v_n int; v_grade smallint; v_picked text[]; i int;
begin
  select * into s from class_sessions where id = p_session;
  select grade into v_grade from classes where id = s.class_id;
  select array_agg(x order by random()) into v_arr from unnest(p_players) x;
  v_n := array_length(v_arr, 1);
  for i in 1 .. (v_n + 1) / 2 loop
    insert into class_duel_matches (session_id, round, slot, a, b, winner)
    values (p_session, p_round, i, v_arr[2 * i - 1], v_arr[2 * i], case when v_arr[2 * i] is null then v_arr[2 * i - 1] end);
  end loop;
  select array_agg(id) into v_picked from (
    select q.id from questions q
     where q.active and q.grade = v_grade and (s.subject = 'mixed' or q.subject::text = s.subject)
       and not exists (select 1 from class_session_questions u where u.session_id = p_session and u.question_id = q.id)
     order by random() limit s.question_count) x;
  if coalesce(array_length(v_picked, 1), 0) < s.question_count then raise exception 'not enough questions for that choice'; end if;
  insert into class_session_questions (session_id, idx, question_id, seconds)
  select p_session, (p_round - 1) * s.question_count + t.i - 1, t.id,
         case when position(E'\n\n' in (select prompt from questions where id = t.id)) > 0
              then (v_rules->>'reading_seconds')::int else (v_rules->>'seconds')::int end
    from unnest(v_picked) with ordinality t(id, i);
end $$;
revoke execute on function public.class_duel_make_round(uuid, int, uuid[]) from public, anon, authenticated;

-- Decides every match of a round: higher score wins, then the faster correct answers, then a coin flip. Someone who left loses.
-- Returns the winners in bracket order.
create function public.class_duel_round_end(p_session uuid, p_round int) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare s class_sessions; m class_duel_matches; v_win uuid; v_ta numeric; v_tb numeric; v_left_a boolean; v_left_b boolean; v_out uuid[] := '{}';
begin
  select * into s from class_sessions where id = p_session;
  for m in select * from class_duel_matches where session_id = p_session and round = p_round order by slot loop
    if m.winner is null then
      select exists (select 1 from class_session_players where session_id = p_session and child_id = m.a and left_at is not null) into v_left_a;
      select exists (select 1 from class_session_players where session_id = p_session and child_id = m.b and left_at is not null) into v_left_b;
      select coalesce(sum(extract(epoch from answered_at)), 1e18) into v_ta from class_session_answers
       where session_id = p_session and child_id = m.a and correct and idx >= (p_round - 1) * s.question_count and idx < p_round * s.question_count;
      select coalesce(sum(extract(epoch from answered_at)), 1e18) into v_tb from class_session_answers
       where session_id = p_session and child_id = m.b and correct and idx >= (p_round - 1) * s.question_count and idx < p_round * s.question_count;
      v_win := case
        when v_left_a and not v_left_b then m.b
        when v_left_b and not v_left_a then m.a
        when m.a_score > m.b_score then m.a
        when m.b_score > m.a_score then m.b
        when v_ta < v_tb then m.a
        when v_tb < v_ta then m.b
        when random() < 0.5 then m.a else m.b end;
      update class_duel_matches set winner = v_win where session_id = p_session and round = p_round and slot = m.slot;
      m.winner := v_win;
    end if;
    v_out := v_out || m.winner;
  end loop;
  return v_out;
end $$;
revoke execute on function public.class_duel_round_end(uuid, int) from public, anon, authenticated;

create or replace function public.class_live_create(p_class uuid, p_kind text, p_subject text, p_count int, p_mission uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_code text; v_id uuid; v_try int := 0; v_n int := p_count; v_boss text;
begin
  if not teaches_class(p_class) then raise exception 'not your class'; end if;
  if p_kind not in ('quiz', 'boss', 'mystery', 'duel') then raise exception 'pick quiz, boss, mystery or duel'; end if;
  if p_kind = 'duel' and p_mission is not null then raise exception 'duels use word questions'; end if;
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

create or replace function public.class_live_start(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare s class_sessions; v_rules jsonb := setting('class_live'); v_n int; v_players int; v_picked text[]; v_grade smallint;
begin
  select * into s from class_sessions where code = upper(trim(p_code)) and state = 'lobby' for update;
  if s.id is null or not teaches_class(s.class_id) then raise exception 'no lobby with that code'; end if;
  select count(*) into v_players from class_session_players where session_id = s.id and left_at is null;
  if v_players < 1 then raise exception 'wait for at least one student'; end if;
  select grade into v_grade from classes where id = s.class_id;
  if s.kind = 'duel' then
    if v_players < 2 then raise exception 'a duel needs at least two students'; end if;
    perform class_duel_make_round(s.id, 1, (select array_agg(child_id) from class_session_players where session_id = s.id and left_at is null));
  elsif s.mission_id is not null then
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
         boss_max = case when kind = 'boss' then v_players * v_n * (v_rules->>'boss_hp_per_answer')::int when kind = 'mystery' then greatest(1, round(v_players * v_n * 0.7)::int) else 0 end,
         boss_hp = case when kind = 'boss' then v_players * v_n * (v_rules->>'boss_hp_per_answer')::int when kind = 'mystery' then greatest(1, round(v_players * v_n * 0.7)::int) else 0 end
   where id = s.id;
end $$;

create or replace function public.class_live_finish(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s class_sessions; v_rules jsonb := setting('class_live'); p record; v_coins int; v_won boolean; v_played int; v_wins int;
begin
  select * into s from class_sessions where id = p_session for update;
  if s.rewarded then return; end if;
  v_won := s.kind in ('boss', 'mystery') and s.boss_hp <= 0;
  for p in select * from class_session_players where session_id = p_session loop
    v_coins := 0;
    if s.kind = 'duel' then
      select count(*) filter (where m.b is not null), count(*) filter (where m.b is not null and m.winner = p.child_id) into v_played, v_wins
        from class_duel_matches m where m.session_id = p_session and p.child_id in (m.a, m.b);
      if v_played > 0 then
        v_coins := least(30, 5 + 5 * v_wins + case when exists (select 1 from class_duel_matches m where m.session_id = p_session and m.winner = p.child_id
                                                                 and m.round = (select max(round) from class_duel_matches where session_id = p_session)) then 10 else 0 end);
      end if;
    elsif p.answered * 2 >= s.question_count then
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

create or replace function public.class_live_tick(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s class_sessions; v_rules jsonb := setting('class_live'); v_secs int; v_active int; v_answered int; v_total int; v_round int; v_winners uuid[];
begin
  select * into s from class_sessions where id = p_session for update;
  if s.state <> 'playing' then return; end if;
  select count(*) into v_total from class_session_questions where session_id = p_session;
  loop
    select seconds into v_secs from class_session_questions where session_id = p_session and idx = s.idx;
    if s.kind = 'duel' then
      select count(*) into v_active from class_session_players p where p.session_id = p_session and p.left_at is null
         and exists (select 1 from class_duel_matches m where m.session_id = p_session and m.round = s.idx / s.question_count + 1 and m.b is not null and p.child_id in (m.a, m.b));
    else
      select count(*) into v_active from class_session_players where session_id = p_session and left_at is null;
    end if;
    select count(*) into v_answered from class_session_answers a join class_session_players p on p.session_id = a.session_id and p.child_id = a.child_id
     where a.session_id = p_session and a.idx = s.idx and p.left_at is null;
    if s.phase = 'question' and (now() >= s.phase_started_at + make_interval(secs => v_secs) or (v_active > 0 and v_answered >= v_active)) then
      update class_sessions set phase = 'reveal', phase_started_at = now() where id = p_session returning * into s;
    elsif s.phase = 'reveal' and now() >= s.phase_started_at + make_interval(secs => (v_rules->>'reveal_seconds')::int) then
      if s.kind = 'duel' then
        if (s.idx + 1) % s.question_count = 0 then
          v_round := (s.idx + 1) / s.question_count;
          v_winners := class_duel_round_end(p_session, v_round);
          if coalesce(array_length(v_winners, 1), 0) <= 1 then
            update class_sessions set state = 'done' where id = p_session returning * into s;
            perform class_live_finish(p_session);
          else
            perform class_duel_make_round(p_session, v_round + 1, v_winners);
            update class_sessions set phase = 'question', idx = idx + 1, phase_started_at = now() where id = p_session returning * into s;
          end if;
        else
          update class_sessions set phase = 'question', idx = idx + 1, phase_started_at = now() where id = p_session returning * into s;
        end if;
      elsif s.idx + 1 >= v_total or (s.kind in ('boss', 'mystery') and s.boss_hp <= 0) then
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

create or replace function public.class_live_answer(p_choice int) returns jsonb
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
  if s.kind = 'duel' and not exists (select 1 from class_duel_matches m where m.session_id = s.id and m.round = s.idx / s.question_count + 1 and m.b is not null and me in (m.a, m.b)) then
    return jsonb_build_object('watching', true);
  end if;
  if exists (select 1 from class_session_answers where session_id = s.id and idx = s.idx and child_id = me) then
    return jsonb_build_object('repeat', true);
  end if;
  q := class_live_q(s.id, s.idx);
  if p_choice is null or p_choice not between 0 and jsonb_array_length(q->'choices') - 1 then raise exception 'pick one of the choices'; end if;
  v_right := p_choice = (q->>'answer')::int;
  if v_right then
    v_left := greatest(0, 1 - extract(epoch from now() - s.phase_started_at) / (q->>'seconds')::numeric);
    v_points := 100 + floor(50 * v_left)::int;
    if s.kind = 'boss' then v_damage := 10 + floor(10 * v_left)::int; elsif s.kind = 'mystery' then v_damage := 1; end if;
  end if;
  insert into class_session_answers (session_id, idx, child_id, choice, correct, points, damage)
  values (s.id, s.idx, me, p_choice, v_right, v_points, v_damage);
  update class_session_players set score = score + v_points, answered = answered + 1, correct = correct + case when v_right then 1 else 0 end
   where session_id = s.id and child_id = me;
  if s.kind = 'duel' and v_right then
    update class_duel_matches set a_score = a_score + case when a = me then 1 else 0 end, b_score = b_score + case when b = me then 1 else 0 end
     where session_id = s.id and round = s.idx / s.question_count + 1 and me in (a, b);
  end if;
  if v_damage > 0 then update class_sessions set boss_hp = greatest(0, boss_hp - v_damage) where id = s.id; end if;
  perform class_live_tick(s.id);
  return jsonb_build_object('accepted', true);
end $$;

create or replace function public.class_live_state(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_round int; s class_sessions; v_rules jsonb := setting('class_live'); v_teacher boolean; v_q jsonb; v_out jsonb; v_boss raid_bosses; v_me uuid := auth.uid();
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
    'boss', case when s.kind = 'boss' then jsonb_build_object('name', v_boss.name, 'icon', v_boss.icon, 'hp', s.boss_hp, 'max', s.boss_max)
                 when s.kind = 'mystery' then jsonb_build_object('name', 'Mystery picture', 'icon', '🖼️', 'hp', s.boss_hp, 'max', s.boss_max) end,
    'players', coalesce((select jsonb_agg(jsonb_build_object(
        'name', h.display_name, 'starter', h.starter_hero, 'score', p.score, 'correct', p.correct, 'me', p.child_id = v_me,
        'answered', exists (select 1 from class_session_answers a where a.session_id = s.id and a.idx = s.idx and a.child_id = p.child_id))
        order by p.score desc, h.display_name)
      from class_session_players p join heroes h on h.id = p.child_id where p.session_id = s.id and p.left_at is null), '[]'::jsonb));

  if s.kind = 'duel' then
    v_round := case when s.state = 'playing' then s.idx / s.question_count + 1 else coalesce((select max(round) from class_duel_matches where session_id = s.id), 1) end;
    v_out := v_out || jsonb_build_object('duel', jsonb_build_object(
      'round', v_round,
      'rounds', coalesce((select ceil(log(2::numeric, greatest(2, sum(1 + (b is not null)::int))::numeric))::int from class_duel_matches where session_id = s.id and round = 1), 1),
      'my_status', case
          when s.state in ('done', 'closed') and exists (select 1 from class_duel_matches m where m.session_id = s.id and m.winner = v_me
                                                           and m.round = (select max(round) from class_duel_matches where session_id = s.id)) then 'champion'
          when exists (select 1 from class_duel_matches m where m.session_id = s.id and m.round = v_round and m.b is not null and v_me in (m.a, m.b)) then 'dueling'
          when exists (select 1 from class_duel_matches m where m.session_id = s.id and m.round = v_round and m.b is null and m.a = v_me) then 'bye'
          when exists (select 1 from class_duel_matches m where m.session_id = s.id and v_me in (m.a, m.b)) then 'out'
          else 'watching' end,
      'matches', coalesce((select jsonb_agg(jsonb_build_object(
          'round', m.round, 'slot', m.slot, 'me', v_me in (m.a, m.b),
          'a', jsonb_build_object('name', ha.display_name, 'starter', ha.starter_hero, 'score', m.a_score),
          'b', case when m.b is not null then jsonb_build_object('name', hb.display_name, 'starter', hb.starter_hero, 'score', m.b_score) end,
          'winner', case when m.winner = m.a then 'a' when m.winner = m.b then 'b' end,
          'a_answered', s.state = 'playing' and m.round = v_round and exists (select 1 from class_session_answers x where x.session_id = s.id and x.idx = s.idx and x.child_id = m.a),
          'b_answered', s.state = 'playing' and m.round = v_round and exists (select 1 from class_session_answers x where x.session_id = s.id and x.idx = s.idx and x.child_id = m.b),
          'a_right', case when s.state = 'playing' and s.phase = 'reveal' and m.round = v_round then (select x.correct from class_session_answers x where x.session_id = s.id and x.idx = s.idx and x.child_id = m.a) end,
          'b_right', case when s.state = 'playing' and s.phase = 'reveal' and m.round = v_round then (select x.correct from class_session_answers x where x.session_id = s.id and x.idx = s.idx and x.child_id = m.b) end)
          order by m.round, m.slot)
        from class_duel_matches m join heroes ha on ha.id = m.a left join heroes hb on hb.id = m.b where m.session_id = s.id), '[]'::jsonb)));
  end if;
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
