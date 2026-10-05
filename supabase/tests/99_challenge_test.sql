-- Weekly House challenge.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(97, 100) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(97), 'CHAAAAA2', 'Chal A', 5, 'ana'), (u(98), 'CHBBBBB2', 'Chal B', 5, 'ana'),
  (u(99), 'CHCCCCC2', 'Chal C', 5, 'ana'), (u(100), 'CHDDDDD2', 'Chal D', 5, 'ana');
insert into public.questions (id, subject, grade, skill, difficulty, prompt, choices)
select 'ch5-' || n, 'math', 5, 'fractions', 1, 'Challenge question ' || n, '["a","b"]'::jsonb from generate_series(1, 40) n;
insert into public.question_keys (question_id, answer, explanation) select 'ch5-' || n, 0, 'x' from generate_series(1, 40) n;

do $$
declare c uuid; r jsonb; i int;
begin
  perform as_user(3);
  c := (create_class('Chal Room', 5)->>'id')::uuid;
  perform as_admin();
  insert into class_members (class_id, child_id) values (c, u(97)), (c, u(98)), (c, u(99)), (c, u(100));
  insert into houses (class_id, name, color, power) values (c, 'Challengers', '#ff8800', 'flame');

  perform as_user(97);
  assert house_challenge()->>'state' = 'none', 'no challenge set yet';
  perform expect_error($q$select sensei_set_challenge('Reading Week', 20, 15)$q$, 'only the Sensei');
  perform as_user(4);
  perform expect_error($q$select sensei_set_challenge('X', 20, 15)$q$, 'theme');
  perform expect_error($q$select sensei_set_challenge('Reading Week', 200, 15)$q$, 'goal');
  perform expect_error($q$select sensei_set_challenge('Reading Week', 20, 500)$q$, 'reward');
  perform sensei_set_challenge('Reading Week', 20, 15);
  r := sensei_challenge_view();
  assert r->>'theme' = 'Reading Week' and (r->>'goal')::int = 20, 'sensei sees it';

  -- 97 answers 12 questions right (24 points), 98 answers 6 (12 points); the House average is 9 of 20
  perform as_admin();
  for i in 1..12 loop insert into question_history (child_id, question_id, answered_at, correct) values (u(97), 'ch5-' || i, now(), true); end loop;
  for i in 1..6 loop insert into question_history (child_id, question_id, answered_at, correct) values (u(98), 'ch5-' || i, now(), true); end loop;
  perform as_user(97);
  r := house_challenge();
  assert r->>'state' = 'active' and (r->>'progress')::numeric = 9.0 and not (r->>'reached')::boolean, 'not there yet: ' || r::text;
  perform expect_error($q$select house_challenge_claim()$q$, 'not reached');

  -- 99 and 100 pitch in: 20 more questions each makes the average (24+12+40+40)/4 = 29
  perform as_admin();
  for i in 1..20 loop insert into question_history (child_id, question_id, answered_at, correct) values (u(99), 'ch5-' || i, now(), true), (u(100), 'ch5-' || i, now(), true); end loop;
  perform as_user(97);
  r := house_challenge();
  assert (r->>'reached')::boolean and (r->>'progress')::numeric = 29.0, 'reached: ' || r::text;
  assert (house_challenge_claim()->>'awarded')::int = 15, 'reward 15';
  assert (house_challenge_claim()->>'duplicate')::boolean, 'once a week';
  assert (house_challenge()->>'claimed')::boolean, 'claimed';

  -- a hero who did not help cannot collect
  perform as_admin();
  delete from question_history where child_id = u(100);
  insert into question_history (child_id, question_id, answered_at, correct) values (u(100), 'ch5-1', now(), true), (u(100), 'ch5-2', now(), true);
  insert into question_history (child_id, question_id, answered_at, correct) select u(98), 'ch5-' || n, now(), true from generate_series(7, 20) n;
  perform as_user(100);
  perform expect_error($q$select house_challenge_claim()$q$, 'yourself');
end $$;

select as_admin();
delete from public.houses where name = 'Challengers';
delete from public.class_members where child_id in (select u(n) from generate_series(97, 100) n);
delete from public.classes where name = 'Chal Room';
delete from public.question_history where question_id like 'ch5-%';
delete from public.questions where id like 'ch5-%';
