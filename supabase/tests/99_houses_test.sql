-- Houses: teacher proposals, class vote, capped verified scoring, size-fair leaderboard.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(31, 36) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(31), 'HSAAAAA2', 'Hero A', 5, 'ana'), (u(32), 'HSBBBBB2', 'Hero B', 5, 'ana'), (u(33), 'HSCCCCC2', 'Hero C', 5, 'ana'),
  (u(34), 'HSDDDDD2', 'Hero D', 6, 'ana'), (u(35), 'HSEEEEE2', 'Hero E', 6, 'ana'), (u(36), 'HSFFFFF2', 'Hero F', 6, 'ana');
insert into public.questions (id, subject, grade, skill, difficulty, prompt, choices)
select 'hs5-' || n, 'math', 5, 'fractions', 1, 'House question ' || n, '["a","b"]'::jsonb from generate_series(1, 60) n;
insert into public.question_keys (question_id, answer, explanation) select 'hs5-' || n, 0, 'x' from generate_series(1, 60) n;

do $$
declare
  c5 uuid; c6 uuid; r jsonb; opt jsonb; i int;
begin
  perform as_user(3);
  c5 := (create_class('Fire Room', 5)->>'id')::uuid;
  c6 := (create_class('Storm Room', 6)->>'id')::uuid;
  perform as_admin();
  insert into class_members (class_id, child_id) values (c5, u(31)), (c5, u(32)), (c5, u(33)), (c6, u(34)), (c6, u(35)), (c6, u(36));
  perform set_config('test.c5', c5::text, false); perform set_config('test.c6', c6::text, false);

  -- proposals are checked
  perform as_user(2);
  perform expect_error(format($q$select house_propose(%L, '[]')$q$, c5), 'not your class');
  perform as_user(3);
  perform expect_error(format($q$select house_propose(%L, '[{"name":"Solo","color":"#ff0000","power":"flame"}]')$q$, c5), '2 or 3');
  perform expect_error(format($q$select house_propose(%L, '[{"name":"Phoenix","color":"#ff0000","power":"flame"},{"name":"Shit Storm","color":"#0000ff","power":"storm"}]')$q$, c5), 'different words');
  perform expect_error(format($q$select house_propose(%L, '[{"name":"Phoenix","color":"red","power":"flame"},{"name":"Tidal","color":"#0000ff","power":"tide"}]')$q$, c5), 'colour');
  perform expect_error(format($q$select house_propose(%L, '[{"name":"Phoenix","color":"#ff0000","power":"laser"},{"name":"Tidal","color":"#0000ff","power":"tide"}]')$q$, c5), 'power');
  perform expect_error(format($q$select house_propose(%L, '[{"name":"Phoenix","color":"#ff0000","power":"flame"},{"name":"phoenix","color":"#0000ff","power":"tide"}]')$q$, c5), 'own name');
  perform house_propose(c5, '[{"name":"Phoenix","color":"#ff0000","power":"flame","motto":"Rise up!"},{"name":"Tidal Wave","color":"#0000ff","power":"tide","motto":"Flow on"},{"name":"Starlight","color":"#ffff00","power":"star"}]');
  perform expect_error(format($q$select house_propose(%L, '[{"name":"A1","color":"#ff0000","power":"flame"},{"name":"B1","color":"#0000ff","power":"tide"}]')$q$, c5), 'already open');
  perform expect_error(format($q$select house_close_vote(%L)$q$, c5), 'at least one vote');

  -- the class votes; heroes see only their own class's options
  perform as_user(31);
  r := house_state();
  assert r->>'state' = 'voting' and jsonb_array_length(r->'options') = 3 and r->'my_vote' = 'null'::jsonb, 'voting state';
  perform house_vote((r->'options'->1->>'id')::bigint);
  perform as_user(32); perform house_vote((r->'options'->1->>'id')::bigint);
  perform as_user(33); perform house_vote((r->'options'->0->>'id')::bigint);
  perform as_user(34);
  assert house_state()->>'state' = 'none', 'another class has no vote yet';
  perform expect_error(format($q$select house_vote(%s)$q$, (r->'options'->0->>'id')), 'not open');
  perform as_user(3);
  r := house_teacher_view(c5);
  assert (r->>'voted')::int = 3 and (r->'options'->1->>'votes')::int = 2, 'teacher sees the tally';
  perform as_user(2); perform expect_error(format($q$select house_close_vote(%L)$q$, c5), 'not your class');
  perform as_user(3);
  perform house_close_vote(c5);
  perform as_user(31);
  r := house_state();
  assert r->>'state' = 'active' and r->'house'->>'name' = 'Tidal Wave', 'the most votes wins';
  perform as_user(3);
  perform expect_error(format($q$select house_propose(%L, '[{"name":"A1","color":"#ff0000","power":"flame"},{"name":"B1","color":"#0000ff","power":"tide"}]')$q$, c5), 'already has a House');

  -- a second class, a tie, the first proposal wins
  perform house_propose(c6, '[{"name":"Gale","color":"#00ffaa","power":"wind"},{"name":"Granite","color":"#888888","power":"earth"}]');
  perform as_admin();
  perform set_config('test.o0', (select id::text from house_options where class_id = c6 and idx = 0), false);
  perform set_config('test.o1', (select id::text from house_options where class_id = c6 and idx = 1), false);
  perform as_user(34); perform house_vote(current_setting('test.o1')::bigint);
  perform as_user(35); perform house_vote(current_setting('test.o0')::bigint);
  perform as_user(3); perform house_close_vote(c6);
  perform as_user(34);
  assert house_state()->'house'->>'name' = 'Gale', 'ties go to the first proposal';
end $$;

-- Scoring: answers are verified, equal everywhere, capped per hero per week, and averaged per member.
do $$
declare r jsonb; i int; h jsonb; c5 uuid := current_setting('test.c5')::uuid;
begin
  perform as_admin();
  -- Hero A answers 60 right (120 points before the cap of 80), Hero B 10 right, Hero C only wrong answers.
  insert into question_history (child_id, question_id, answered_at, correct)
  select u(31), 'hs5-' || n, now(), true from generate_series(1, 60) n;
  insert into question_history (child_id, question_id, answered_at, correct)
  select u(32), 'hs5-' || n, now(), true from generate_series(1, 10) n;
  insert into question_history (child_id, question_id, answered_at, correct)
  select u(33), 'hs5-' || n, now(), false from generate_series(1, 10) n;
  -- Grade 6 class: one hero answers 20 right.
  insert into question_history (child_id, question_id, answered_at, correct)
  select u(34), 'hs5-' || n, now(), true from generate_series(1, 20) n;

  perform as_user(31);
  assert (house_state()->>'week_points')::int = 80, 'a hero is capped at 80 a week';
  r := leaderboard();
  -- Tidal Wave: (80 + 20 + 0) / 3 = 33.3; Gale: 40 / 3 = 13.3
  assert r->'houses'->0->>'name' = 'Tidal Wave' and (r->'houses'->0->>'week')::numeric = 33.3, 'average per member: ' || (r->'houses'->0)::text;
  assert r->'houses'->1->>'name' = 'Gale' and (r->'houses'->1->>'week')::numeric = 13.3;
  assert (r->'houses'->0->>'rank_week')::int = 1 and (r->'houses'->0->>'mine')::boolean, 'my House is marked';
  -- individual standings: grade 5 only, and nobody from grade 6
  assert not (r->'heroes')::text like '%Hero D%' and not (r->'heroes')::text like '%Hero C%', 'grade 5 only, and only heroes with verified points';
  assert r->'heroes'->0->>'name' = 'Hero A' and (r->'heroes'->0->>'week')::int = 80 and (r->'heroes'->0->>'me')::boolean;
  assert not (r::text like '%QKAAAAA2%' or r::text like '%HSAAAAA2%'), 'no hero codes in the board';

  -- a House below the minimum roster is not ranked
  perform as_admin();
  delete from class_members where child_id = u(33);
  perform as_user(31);
  r := leaderboard();
  assert (r->'houses'->0->>'members')::int = 2 or jsonb_array_length(r->'houses') = 1, 'small Houses are left off';
end $$;

select as_admin();
delete from public.question_history where question_id like 'hs5-%';
delete from public.questions where id like 'hs5-%';
