-- Rooms and Trivia Clash: codes, grade match, hidden answers, timing, scoring.
\set ON_ERROR_STOP on

update public.app_settings set value = value || '{"questions": 3}'::jsonb where key = 'room_rules';

do $$
declare
  v_code text; r jsonb; v_right int; v_room uuid; i int;
begin
  perform as_user(11);
  v_code := room_create('trivia-clash');
  assert length(v_code) = 4, 'four letter code';
  perform expect_error($q$select room_create('trivia-clash')$q$, 'leave your room first');
  perform expect_error($q$select room_start()$q$, 'at least 2');
  assert my_room() = v_code, 'my_room finds it';

  perform as_user(12);   -- grade 6
  assert room_join(v_code) is null, 'a room for the other grade looks like no room';
  assert room_join('QQQQ') is null, 'no room with that code';
  for i in 1..8 loop perform room_join('QQQQ'); end loop;
  perform expect_error($q$select room_join('QQQQ')$q$, 'too many tries');
  perform as_admin();
  delete from room_join_misses;
  perform as_user(12);
  perform expect_error(format($q$select room_state(%L)$q$, v_code), 'not in that room');

  perform as_user(13);
  assert room_join(v_code) = v_code, 'join';
  perform expect_error($q$select room_start()$q$, 'not hosting');
  r := room_state(v_code);
  assert jsonb_array_length(r->'players') = 2 and r->>'state' = 'lobby', 'lobby has two';

  perform as_user(11);
  perform room_start();
  r := room_state(v_code);
  assert r->>'state' = 'playing' and r->>'phase' = 'question' and (r->>'total')::int = 3, 'playing';
  assert not (r ? 'right_choice') and not (r->'question' ? 'answer'), 'answer hidden during the question';

  for i in 0..2 loop
    perform as_admin();
    select answer into v_right from test_answers a where a.question_id = (select question_id from room_questions rq join rooms ro on ro.id = rq.room_id where ro.code = v_code and rq.idx = i);
    perform as_user(11);
    perform room_answer(v_right);
    assert (room_answer(v_right)->>'repeat')::boolean, 'second answer ignored';
    perform as_user(13);
    perform room_answer((v_right + 1) % 2);
    r := room_state(v_code);
    assert r->>'phase' = 'reveal' and (r->>'right_choice')::int = v_right, 'reveal after everyone answered';
    perform as_admin();
    update rooms set phase_started_at = now() - interval '10 seconds' where code = v_code;
  end loop;

  perform as_user(11);
  r := room_state(v_code);
  assert r->>'state' = 'done', 'finished';
  assert (r->'players'->0->>'name') = 'Brave Comet' and (r->'players'->0->>'score')::int >= 300, 'winner first';
  assert (r->'players'->1->>'score')::int = 0, 'wrong answers score nothing';
  assert my_room() is null, 'done rooms are not active';

  perform as_admin();
  assert (select count(*) from question_history where child_id in (u(11), u(13)) and served_at > now() - interval '1 minute') >= 6, 'served to both players';
  assert (select count(distinct question_id) from room_questions rq join rooms ro on ro.id = rq.room_id where ro.code = v_code) = 3, 'three different questions';

  -- time running out also moves the game on; leaving closes an empty room
  perform as_user(11);
  v_code := room_create('trivia-clash');
  perform as_user(13); perform room_join(v_code);
  perform as_user(11);
  perform room_leave();
  assert my_room() is null, 'host left';
  perform as_admin();
  assert (select state from rooms where code = v_code) = 'closed', 'host leaving the lobby closes the room';
  perform as_user(13);
  assert my_room() is null, 'nobody is stuck in a closed room';
end $$;
