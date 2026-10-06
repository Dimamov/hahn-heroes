-- Classroom mode: live quiz and class boss. Only the class's teacher runs it, only class members join, answers stay hidden
-- until the reveal, scores and boss damage are server side, rewards are paid once and count toward the Class cap.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(167, 171) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(167), 'CAAAAAA4', 'Live A', 5, 'ana'), (u(168), 'CBBBBBB4', 'Live B', 5, 'ana'), (u(169), 'CCCCCCC4', 'Live C', 5, 'ana'),
  (u(170), 'CDDDDDD4', 'Live D', 5, 'ana'), (u(171), 'CEEEEEE4', 'Live Outsider', 5, 'ana');
insert into public.questions (id, subject, grade, skill, difficulty, prompt, choices)
select 'cl5-' || n, 'math', 5, 'fractions', 1, 'Live question ' || n, '["a","b","c"]'::jsonb from generate_series(1, 10) n;
insert into public.question_keys (question_id, answer, explanation) select 'cl5-' || n, 1, 'because b' from generate_series(1, 10) n;

do $$
declare c uuid; code text; r jsonb; i int; j int; v_right int;
begin
  perform as_user(3);
  c := (create_class('Live Room', 5)->>'id')::uuid;
  perform as_admin();
  insert into class_members (class_id, child_id) values (c, u(167)), (c, u(168)), (c, u(169));
  update questions set active = false where id not like 'cl5-%';
  update app_settings set value = value || '{"seconds": 20, "reveal_seconds": 5}'::jsonb where key = 'class_live';

  -- only the class's teacher can run it
  perform as_user(2);
  perform expect_error(format($q$select class_live_create(%L, 'quiz', 'mixed', 3)$q$, c), 'not your class');
  perform as_user(167);
  perform expect_error(format($q$select class_live_create(%L, 'quiz', 'mixed', 3)$q$, c), 'not your class');

  perform as_user(3);
  perform expect_error(format($q$select class_live_create(%L, 'quiz', 'mixed', 2)$q$, c), '3 to 20');
  perform expect_error(format($q$select class_live_create(%L, 'party', 'mixed', 3)$q$, c), 'quiz, boss or mystery');
  code := class_live_create(c, 'quiz', 'math', 3);
  assert length(code) = 4, 'four letter code';
  perform expect_error(format($q$select class_live_start(%L)$q$, code), 'at least one student');

  -- joining: class members only
  perform as_user(171);
  assert class_live_open() is null, 'outsider sees nothing';
  perform expect_error(format($q$select class_live_join(%L)$q$, code), 'no live class');
  perform as_user(167);
  assert class_live_open()->>'code' = code and (class_live_open()->>'joined')::boolean = false, 'class member sees the open game';
  perform class_live_join(code);
  perform as_user(168); perform class_live_join(code);
  perform as_user(169); perform class_live_join(code);
  perform as_user(171);
  perform expect_error(format($q$select class_live_state(%L)$q$, code), 'not in that game');
  perform as_user(167);
  perform expect_error(format($q$select class_live_start(%L)$q$, code), 'no lobby');

  perform as_user(3);
  r := class_live_state(code);
  assert r->>'role' = 'teacher' and jsonb_array_length(r->'players') = 3, 'teacher sees the lobby';
  perform class_live_start(code);
  r := class_live_state(code);
  assert r->>'state' = 'playing' and r->>'phase' = 'question' and r->'right_choice' is null, 'playing, answer hidden';
  assert r::text not like '%because b%', 'explanation hidden during the question';

  -- play 3 questions: A always right, B always wrong, C never answers; the teacher moves things along
  for i in 1..3 loop
    perform as_user(167);
    assert class_live_answer(1)->>'accepted' = 'true', 'A answers';
    assert (class_live_answer(1)->>'repeat')::boolean, 'a second answer does not count';
    perform as_user(168); perform class_live_answer(0);
    perform as_user(3);
    r := class_live_state(code);
    assert r->>'phase' = 'question' and (r->>'answered')::int = 2, 'two have answered';
    perform class_live_skip(code);   -- ends the question
    r := class_live_state(code);
    assert r->>'phase' = 'reveal' and (r->>'right_choice')::int = 1 and r->>'explanation' = 'because b', 'reveal shows the answer';
    perform as_user(167);
    r := class_live_state(code);
    assert r->>'role' = 'student' and (r->>'my_points')::int >= 100, 'A scored';
    perform as_user(168);
    assert (class_live_state(code)->>'my_points')::int = 0, 'B did not';
    perform as_user(3);
    perform class_live_skip(code);   -- ends the reveal
  end loop;

  r := class_live_state(code);
  assert r->>'state' = 'done', 'finished after three questions';
  assert (r->'players'->0->>'name') = 'Live A', 'A leads the board';

  -- rewards: A full accuracy 25, B took part but missed 5, C answered nothing 0; paid once; counted as class_mission
  perform as_user(167); assert (class_live_state(code)->>'my_reward')::int = 25, 'A gets 25';
  perform as_user(168); assert (class_live_state(code)->>'my_reward')::int = 5, 'B gets 5';
  perform as_user(169); assert (class_live_state(code)->>'my_reward')::int = 0, 'C gets nothing';
  perform as_admin();
  perform class_live_finish((select id from class_sessions where kind = 'quiz' and state = 'done' limit 1));
  assert (select count(*) from ledger_entries where idempotency_key like 'live:%' and currency = 'coins') = 2, 'paid once only';
  assert (select count(*) from ledger_entries where idempotency_key like 'live:%' and source = 'class_mission') = 4, 'coins and xp for two heroes count as class_mission';

  -- boss battle: the class wins together
  perform as_user(3);
  code := class_live_create(c, 'boss', 'math', 3);
  perform as_user(167); perform class_live_join(code);
  perform as_user(168); perform class_live_join(code);
  perform as_user(3);
  perform class_live_start(code);
  r := class_live_state(code);
  assert (r->'boss'->>'max')::int = 2 * 3 * 9 and (r->'boss'->>'hp')::int = 2 * 3 * 9 and r->'boss'->>'name' is not null, 'boss health scales with the class';
  for i in 1..3 loop
    perform as_user(167); perform class_live_answer(1);
    perform as_user(168); perform class_live_answer(1);   -- everyone answered, so the question ends by itself
    perform as_user(3);
    r := class_live_state(code);
    assert r->>'phase' = 'reveal' and (r->>'class_damage')::int >= 20, 'damage dealt';
    perform class_live_skip(code);
    exit when (class_live_state(code)->>'state') = 'done';
  end loop;
  r := class_live_state(code);
  assert r->>'state' = 'done' and (r->'boss'->>'hp')::int = 0, 'boss defeated';
  perform as_user(167); assert (class_live_state(code)->>'my_reward')::int = 30, 'winners get the boss prize';

  -- mystery reveal: every right answer uncovers a piece; the class finishes the picture together
  perform as_user(3);
  code := class_live_create(c, 'mystery', 'math', 3);
  perform as_user(167); perform class_live_join(code);
  perform as_user(168); perform class_live_join(code);
  perform as_user(3);
  perform class_live_start(code);
  r := class_live_state(code);
  assert r->>'kind' = 'mystery' and (r->'boss'->>'max')::int = 4 and (r->'boss'->>'hp')::int = 4, 'two players, three questions: four right answers needed';
  for i in 1..3 loop
    perform as_user(167); perform class_live_answer(1);
    perform as_user(168); perform class_live_answer(1);
    perform as_user(3);
    perform class_live_skip(code);
    exit when (class_live_state(code)->>'state') = 'done';
  end loop;
  r := class_live_state(code);
  assert r->>'state' = 'done' and (r->'boss'->>'hp')::int = 0 and r->>'idx' = '1', 'picture finished after two questions';
  perform as_user(167); assert (class_live_state(code)->>'my_reward')::int = 30, 'the class wins together';

  -- leaving and ending
  perform as_user(3);
  code := class_live_create(c, 'quiz', 'mixed', 3);
  perform as_user(167); perform class_live_join(code); perform class_live_leave();
  perform as_user(3); perform class_live_end(code);
  assert class_live_state(code)->>'state' = 'closed', 'teacher closed it';
end $$;
