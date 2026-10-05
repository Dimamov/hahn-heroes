-- Skill trees and Nexus Surge.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(61, 62) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(61), 'SKAAAAA2', 'Skill A', 5, 'ana'), (u(62), 'SKBBBBB2', 'Skill B', 5, 'ana');
insert into public.questions (id, subject, grade, skill, difficulty, prompt, choices)
select 'sk5-' || n, 'math', 5, 'fractions', 1, 'Skill question ' || n, '["a","b"]'::jsonb from generate_series(1, 30) n;
insert into public.question_keys (question_id, answer, explanation) select 'sk5-' || n, 0, 'x' from generate_series(1, 30) n;
insert into public.question_history (child_id, question_id) select u(61), 'sk5-' || n from generate_series(1, 30) n;

-- the learning test lowers the weekly cap; put the real one back
select as_admin();
update public.app_settings set value = value || '{"learning": 150}' where key = 'weekly_caps';

do $$
declare r jsonb; i int;
begin
  perform as_user(61);
  r := skill_state();
  assert (r->>'points')::int = 0 and jsonb_array_length(r->'skills') = 9, 'nine skills, no points';
  assert (r->'surge'->>'need')::int = 5 and (r->'surge'->>'mult')::numeric = 1.5, 'default surge rules';
  assert skill_learn('sc1')->>'reason' = 'not_enough_points', 'needs points';

  -- four right answers do not start a surge; the fifth does, and pays nothing extra yet
  for i in 1..4 loop r := answer_question('sk5-' || i, 0); end loop;
  assert (r->'surge'->>'streak')::int = 4 and not (r->'surge'->>'active')::boolean, 'streak of 4';
  r := answer_question('sk5-5', 0);
  assert (r->'surge'->>'started')::boolean and (r->'surge'->>'active')::boolean and (r->'surge'->>'seconds_left')::int > 590, 'surge on after 5';
  assert (r->'awarded'->>'coins')::int = 2, 'start pays normal: ' || r::text;

  -- during surge Learn coins x1.5 (2 -> 3); xp is unchanged; re-asking pays nothing
  r := answer_question('sk5-6', 0);
  assert (r->'awarded'->>'coins')::int = 3 and (r->'awarded'->>'xp')::int = 5, 'surge pays 3 coins, same xp';
  assert (answer_question('sk5-6', 0)->>'repeat')::boolean, 'repeat pays nothing';
  assert (select count(*) from ledger_entries where child_id = u(61) and idempotency_key = 'learn:sk5-6' and currency = 'coins') = 1;
  -- a wrong answer resets the streak but does not end the surge
  r := answer_question('sk5-7', 1);
  assert (r->'surge'->>'active')::boolean and (r->'surge'->>'streak')::int = 0, 'wrong answer keeps surge';

  -- skills: tiers, cost, one purchase each
  perform as_admin();
  perform award(u(61), 'skill_points', 20, 'sensei', 'test', 'sk-pts');
  perform as_user(61);
  assert skill_learn('sc2')->>'reason' = 'locked', 'tier 2 needs tier 1';
  assert (skill_learn('sc1')->>'ok')::boolean, 'learned sc1';
  assert skill_learn('sc1')->>'reason' = 'already_learned';
  assert (select coalesce(sum(amount), 0) from ledger_entries where child_id = u(61) and currency = 'skill_points' and source = 'purchase') = -2, 'cost taken once';
  assert (skill_learn('ex1')->>'ok')::boolean and (skill_learn('gd1')->>'ok')::boolean;
  assert (daily_reward_status()->>'amount')::int = 18, 'Early Bird adds 3 to the base of 15';
  perform expect_error($q$select skill_learn('nope')$q$, 'no such skill');

  -- the Surge rules respond to skills: 4 in a row after Quick Study
  assert (skill_state()->'surge'->>'need')::int = 4, 'Quick Study lowers the streak to 4';
end $$;

-- the other hero is untouched
do $$
begin
  perform as_user(62);
  assert skill_state()::text not like '%"learned": true%', 'no shared skills';
  assert (skill_state()->>'points')::int = 0, 'no shared points';
end $$;

select as_admin();
delete from public.question_history where question_id like 'sk5-%';
delete from public.questions where id like 'sk5-%';
