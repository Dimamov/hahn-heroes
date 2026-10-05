-- Learning engine: no repeats, grade match, hidden answers, one payout per question, caps, parent view.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values (u(21), null), (u(22), null);
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(21), 'QKDDDDD2', 'Wild Wolf', 5, 'ana'),
  (u(22), 'QKEEEEE2', 'Kind Star', 6, 'b03');
insert into public.parent_links (child_id, parent_id) values (u(21), u(1));

insert into public.questions (id, subject, grade, skill, difficulty, prompt, choices)
select 'mt5-' || n, 'math', 5, case when n <= 4 then 'fractions' else 'decimals' end, 1, 'What is ' || n || ' + 1?',
       '["a","b","c","d"]'::jsonb from generate_series(1, 7) n;
insert into public.question_keys (question_id, answer, explanation)
select 'mt5-' || n, n % 4, 'Because ' || n from generate_series(1, 7) n;
insert into public.questions (id, subject, grade, skill, difficulty, prompt, choices)
values ('vc6-1', 'vocab', 6, 'prefixes', 1, 'Pick one', '["a","b"]');
insert into public.question_keys values ('vc6-1', 0, 'Because');
-- A readable copy of the keys, so this test can answer as a hero.
create table public.test_answers as select question_id, answer from public.question_keys;
grant select on public.test_answers to authenticated;

-- The answer key cannot be read by students.
select as_user(21);
do $$ begin
  perform expect_error($q$select * from question_keys$q$, 'permission denied');
  perform expect_error($q$select start_practice('cooking')$q$, 'unknown subject');
end $$;

-- A grade 5 hero gets grade 5 questions only, without answers, and never the same one twice.
do $$
declare r jsonb; ids text[]; r2 jsonb;
begin
  r := start_practice('math');
  assert jsonb_array_length(r->'questions') = 5, 'a set is five questions';
  assert (r->>'remaining')::int = 2;
  assert not (r->'questions'->0 ? 'answer'), 'the answer is not sent';
  select array_agg(q->>'id') into ids from jsonb_array_elements(r->'questions') q;
  perform set_config('test.ids', array_to_string(ids, ','), false);
  -- Asking again soon resumes the same unanswered set.
  r2 := start_practice('math');
  assert (select array_agg(q->>'id' order by q->>'id') from jsonb_array_elements(r2->'questions') q) = (select array_agg(i order by i) from unnest(ids) i), 'resume';
  assert (start_practice('vocab')->>'remaining')::int = 0, 'no grade 6 questions for a grade 5 hero';
end $$;

-- Answering: right pays once; the same answer again pays nothing; a wrong answer pays nothing.
do $$
declare ids text[] := string_to_array(current_setting('test.ids'), ','); r jsonb; q text; k int; c0 int; c1 int;
begin
  q := ids[1];
  k := (select answer from test_answers where question_id = q);
  r := answer_question(q, k);
  assert (r->>'correct')::boolean and (r->'awarded'->>'coins')::int = 2 and (r->'awarded'->>'xp')::int = 5, r::text;
  assert (select balance from my_balances where currency = 'skill_points') = 1;
  r := answer_question(q, k);
  assert (r->>'repeat')::boolean, 'second answer is just feedback';
  assert (select balance from my_balances where currency = 'coins') = 2, 'no second payout';
  q := ids[2];
  k := (select answer from test_answers where question_id = q);
  r := answer_question(q, (k + 1) % 4);
  assert not (r->>'correct')::boolean and (r->>'right_choice')::int = k and length(r->>'explanation') > 0, r::text;
  assert (select balance from my_balances where currency = 'coins') = 2, 'wrong answers pay nothing';
  perform expect_error(format('select answer_question(%L, 0)', (select id from questions where id like 'mt5-%' and id <> all (ids) limit 1)), 'was not handed');
end $$;

-- The set is used up only by answering; a fresh set never repeats an answered question.
do $$
declare ids text[] := string_to_array(current_setting('test.ids'), ','); r jsonb; ans text[];
begin
  for i in 3 .. 5 loop
    perform answer_question(ids[i], (select answer from test_answers where question_id = ids[i]));
  end loop;
  r := start_practice('math');
  assert jsonb_array_length(r->'questions') = 2 and (r->>'remaining')::int = 0, 'only unseen questions are left';
  assert not exists (select 1 from jsonb_array_elements(r->'questions') q where q->>'id' = any (ids)), 'no repeats';
end $$;

-- The weekly cap on learning coins.
do $$
declare r jsonb; ids text[];
begin
  reset role;
  update app_settings set value = value || '{"learning": 6}' where key = 'weekly_caps';
  perform set_config('request.jwt.claim.sub', u(21)::text, false);
  set role authenticated;
  select array_agg(q->>'id') into ids from jsonb_array_elements(start_practice('math')->'questions') q;
  assert (select balance from my_balances where currency = 'coins') = 8, 'four right answers so far';
  r := answer_question(ids[1], (select answer from test_answers where question_id = ids[1]));
  assert (r->'awarded'->>'coins')::int = 0 and (r->'awarded'->>'capped')::boolean, 'weekly cap: ' || r::text;
  assert (select balance from my_balances where currency = 'coins') = 8, 'cap holds';
  assert (select balance from my_balances where currency = 'xp') = 25, 'xp still counts';
end $$;

-- Parents see the child's progress; other adults and heroes do not.
select as_user(1);
do $$
declare s jsonb; m jsonb;
begin
  s := child_learning(u(21));
  m := (select e from jsonb_array_elements(s) e where e->>'subject' = 'math');
  assert (m->>'answered')::int = 6 and (m->>'correct')::int = 5, m::text;
  assert (select count(*) from jsonb_array_elements(m->'skills')) = 2, 'skills are tracked';
  assert (select count(*) from skill_stats where child_id = u(21)) = 2, 'a parent reads the stats';
end $$;
select as_user(2);
select expect_error($q$select child_learning(u(21))$q$, 'not your child');
select as_user(22);
select expect_error($q$select child_learning(u(21))$q$, 'not your child');
do $$ begin
  assert (select count(*) from skill_stats) = 0, 'a hero reads only their own stats';
  assert jsonb_array_length(my_learning()) = 4, 'one entry per subject';
end $$;

reset role;
select 'learning tests passed' as result;
