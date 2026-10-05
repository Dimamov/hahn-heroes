-- A hero sees only their own weekly recap; adults without a hero cannot call it.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(108, 108) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values (u(108), 'MWAAAAA2', 'My Week', 5, 'ana');

do $$
declare r jsonb;
begin
  perform as_admin();
  insert into questions (id, subject, grade, skill, difficulty, prompt, choices) values
    ('mw-1', 'math', 5, 'fractions', 1, 'Q', '["a","b"]'::jsonb), ('mw-2', 'math', 5, 'fractions', 1, 'Q', '["a","b"]'::jsonb);
  insert into question_history (child_id, question_id, answered_at, correct) values (u(108), 'mw-1', now(), true), (u(108), 'mw-2', now(), false);
  perform award(u(108), 'coins', 10, 'home_mission', 'chore', 'mw:chore');

  perform as_user(108);
  r := my_week();
  assert (r->>'answered')::int = 2 and (r->>'correct')::int = 1 and (r->>'points')::int = 10 and (r->>'missions')::int = 1, 'numbers: ' || r::text;
  assert (my_week(1)->>'answered')::int = 0, 'last week is empty';

  perform as_user(1);
  perform expect_error($q$select my_week()$q$, '');

  perform as_admin();
end $$;

delete from auth.users where id = u(108);
delete from public.questions where id like 'mw-%';
