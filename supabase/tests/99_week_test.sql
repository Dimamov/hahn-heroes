-- Weekly summary: a parent sees this week's practice for their own child only.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(106, 106) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(106), 'WKAAAAA2', 'Week A', 5, 'ana');

do $$
declare r jsonb; v_math text[]; v_sci text[];
begin
  perform as_admin();
  insert into parent_links (child_id, parent_id) values (u(106), u(1)) on conflict do nothing;
  insert into questions (id, subject, grade, skill, difficulty, prompt, choices)
  select 'wk-' || n, (case when n <= 3 then 'math' else 'science' end)::question_subject, 5, 'fractions', 1, 'Week question ' || n, '["a","b"]'::jsonb from generate_series(1, 5) n;
  v_math := array['wk-1', 'wk-2', 'wk-3'];
  v_sci := array['wk-4', 'wk-5'];
  -- this week: 3 math (2 right), 1 science (right); last week: 1 science
  insert into question_history (child_id, question_id, answered_at, correct) values
    (u(106), v_math[1], now(), true), (u(106), v_math[2], now(), true), (u(106), v_math[3], now(), false),
    (u(106), v_sci[1], now(), true), (u(106), v_sci[2], now() - interval '7 days', true);
  perform award(u(106), 'coins', 10, 'home_mission', 'chore', 'week:chore');

  perform as_user(1);
  r := child_week(u(106));
  assert (r->>'answered')::int = 4 and (r->>'correct')::int = 3, 'this week: ' || r::text;
  assert (r->>'days_active')::int = 1 and (r->>'points')::int = 10 and (r->>'missions')::int = 1, 'days, points, missions: ' || r::text;
  assert jsonb_array_length(r->'subjects') = 2, 'two subjects';
  r := child_week(u(106), 1);
  assert (r->>'answered')::int = 1, 'last week has its own numbers: ' || r::text;
  perform as_user(2);
  perform expect_error(format($q$select child_week(%L)$q$, u(106)), 'not your child');
  perform as_admin();
  delete from parent_links where child_id = u(106);
end $$;

delete from auth.users where id = u(106);
delete from public.questions where id like 'wk-%';
