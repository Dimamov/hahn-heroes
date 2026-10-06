-- Student-made questions: only class members write them, words are checked, the teacher approves first,
-- the thank-you is paid once, and approved questions become a class quiz.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(179, 181) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(179), 'CSSSSSS4', 'Ask A', 5, 'ana'), (u(180), 'CTTTTTT4', 'Ask B', 5, 'ana'), (u(181), 'CUUUUUU4', 'Ask Outsider', 5, 'ana');

do $$
declare c uuid; r jsonb; i int; m uuid;
begin
  perform as_user(3);
  c := (create_class('Ask Room', 5)->>'id')::uuid;
  perform as_admin();
  insert into class_members (class_id, child_id) values (c, u(179)), (c, u(180));

  perform as_user(181);
  perform expect_error($q$select student_q_submit('What is two plus two?', '["3","4","5"]', 1)$q$, 'join a class');
  perform as_user(179);
  perform expect_error($q$select student_q_submit('Hi', '["3","4","5"]', 1)$q$, 'letters');
  perform expect_error($q$select student_q_submit('What is two plus two?', '["3","4"]', 1)$q$, '3 or 4');
  perform expect_error($q$select student_q_submit('What is two plus two?', '["3","4","5"]', 3)$q$, 'right answer');
  perform expect_error($q$select student_q_submit('What is two plus two?', '["3","shit","5"]', 1)$q$, 'different words');
  perform expect_error($q$select student_q_submit('Visit www.bad.com to see', '["3","4","5"]', 1)$q$, 'links');
  for i in 1..5 loop
    perform student_q_submit('Question number ' || i || ' for the class', '["a","b","c"]', 1, 'because b');
  end loop;
  perform expect_error($q$select student_q_submit('One more question please', '["a","b","c"]', 1)$q$, 'all your questions');
  assert jsonb_array_length(student_q_mine()) = 5, 'own list';

  -- another student's list is their own
  perform as_user(180);
  assert jsonb_array_length(student_q_mine()) = 0, 'not shared';
  perform expect_error(format($q$select student_q_list(%L)$q$, c), 'not your class');

  -- teacher decides
  perform as_user(3);
  r := student_q_list(c);
  assert jsonb_array_length(r) = 5, 'five waiting';
  perform expect_error(format($q$select student_q_make_quiz(%L, 'Student quiz')$q$, c), 'at least 3');
  for i in 0..3 loop perform student_q_decide((r->i->>'id')::uuid, true); end loop;
  perform student_q_decide((r->4->>'id')::uuid, false);
  perform student_q_decide((r->0->>'id')::uuid, true);
  perform as_admin();
  assert (select count(*) from ledger_entries where child_id = u(179) and idempotency_key like 'sq:%') = 4, 'paid once per approved question';
  assert (select count(*) from class_student_questions where status = 'rejected') = 1, 'rejected is kept, not erased';

  perform as_user(3);
  m := student_q_make_quiz(c, 'Student quiz');
  assert m is not null, 'quiz made';
  perform as_admin();
  assert (select jsonb_array_length(questions) from class_missions where id = m) = 4, 'four questions';
  perform as_user(3);
  assert jsonb_array_length(student_q_list(c)) = 0, 'used ones leave the list';
end $$;
