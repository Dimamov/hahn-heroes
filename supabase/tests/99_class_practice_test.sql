-- Homework helper: only the teacher assigns, progress counts real practice answers since it was assigned, soft cancel.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(176, 178) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(176), 'CNNNNNN4', 'Prac A', 5, 'ana'), (u(177), 'CPPPPPP4', 'Prac B', 5, 'ana'), (u(178), 'CRRRRRR4', 'Prac Outsider', 5, 'ana');
insert into public.questions (id, subject, grade, skill, difficulty, prompt, choices)
select 'cp5-' || n, (case when n <= 6 then 'math' else 'vocab' end)::question_subject, 5, 'fractions', 1, 'Practice question ' || n, '["a","b","c"]'::jsonb from generate_series(1, 8) n;

do $$
declare c uuid; pid uuid; r jsonb;
begin
  perform as_user(3);
  c := (create_class('Practice Room', 5)->>'id')::uuid;
  perform as_admin();
  insert into class_members (class_id, child_id) values (c, u(176)), (c, u(177));

  perform as_user(176);
  perform expect_error(format($q$select class_practice_assign(%L, 'math', 5, current_date + 3)$q$, c), 'not your class');
  perform as_user(3);
  perform expect_error(format($q$select class_practice_assign(%L, 'math', 3, current_date + 3)$q$, c), 'check');
  perform expect_error(format($q$select class_practice_assign(%L, 'math', 5, current_date - 30)$q$, c), 'past');
  pid := class_practice_assign(c, 'math', 5, current_date + 3);

  -- an old answer (before the assignment) does not count; new math answers do, vocab ones do not
  perform as_admin();
  insert into question_history (child_id, question_id, answered_at, correct) values (u(176), 'cp5-1', now() - interval '2 days', true);
  insert into question_history (child_id, question_id, answered_at, correct)
    select u(176), 'cp5-' || n, now() + interval '1 second', true from generate_series(2, 7) n;
  perform as_user(176);
  r := class_practice_list();
  assert jsonb_array_length(r) = 1 and (r->0->>'done')::int = 5, 'five new math answers count (the vocab one and the old one do not)';
  perform as_user(178);
  assert jsonb_array_length(class_practice_list()) = 0, 'outsider sees nothing';
  perform expect_error(format($q$select class_practice_list(%L)$q$, c), 'not your class');

  perform as_user(3);
  r := class_practice_list(c);
  assert jsonb_array_length(r->0->'students') = 2, 'teacher sees both students';
  assert (select max((s->>'done')::int) from jsonb_array_elements(r->0->'students') s) = 5, 'with progress';
  perform class_practice_cancel(pid);
  assert jsonb_array_length(class_practice_list(c)) = 0, 'cancelled hides it';
  perform as_admin();
  assert (select count(*) from class_practice where id = pid and not active) = 1, 'soft delete keeps the row';
end $$;
