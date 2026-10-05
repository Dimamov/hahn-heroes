-- Teacher progress report: a teacher sees only their own class.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(107, 107) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values (u(107), 'RPAAAAA2', 'Report A', 5, 'ana');

do $$
declare r jsonb; v_class uuid;
begin
  perform as_admin();
  insert into classes (teacher_id, name, grade, join_code) values (u(3), 'Report Room', 5, 'RPRT22') returning id into v_class;
  insert into class_members (class_id, child_id) values (v_class, u(107));
  insert into questions (id, subject, grade, skill, difficulty, prompt, choices) values ('rp-1', 'math', 5, 'fractions', 1, 'Q', '["a","b"]'::jsonb), ('rp-2', 'math', 5, 'fractions', 1, 'Q', '["a","b"]'::jsonb);
  insert into question_history (child_id, question_id, answered_at, correct) values (u(107), 'rp-1', now(), true), (u(107), 'rp-2', now(), false);

  perform as_user(3);
  r := class_report(v_class);
  assert r->>'class_name' = 'Report Room', 'name';
  assert jsonb_array_length(r->'students') = 1 and (r->'students'->0->>'answered')::int = 2 and (r->'students'->0->>'correct')::int = 1, 'numbers: ' || r::text;
  assert (class_report(v_class, 1)->'students'->0->>'answered')::int = 0, 'last week is empty';

  perform as_user(11);
  perform expect_error(format($q$select class_report(%L)$q$, v_class), 'not your class');
  perform as_user(1);
  perform expect_error(format($q$select class_report(%L)$q$, v_class), 'not your class');

  perform as_admin();
  delete from class_members where class_id = v_class;
  delete from classes where id = v_class;
end $$;

delete from auth.users where id = u(107);
delete from public.questions where id like 'rp-%';
