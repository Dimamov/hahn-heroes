-- Class streak goal: only the teacher sets it, a day counts when enough of the class practiced, the reward is paid once.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(172, 175) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(172), 'CFFFFFF4', 'Goal A', 5, 'ana'), (u(173), 'CGGGGGG4', 'Goal B', 5, 'ana'),
  (u(174), 'CHHHHHH4', 'Goal C', 5, 'ana'), (u(175), 'CJJJJJJ4', 'Goal Outsider', 5, 'ana');
insert into public.questions (id, subject, grade, skill, difficulty, prompt, choices)
select 'cg5-' || n, 'math', 5, 'fractions', 1, 'Goal question ' || n, '["a","b","c"]'::jsonb from generate_series(1, 3) n;

do $$
declare c uuid; s jsonb; r jsonb; v_mon timestamptz := (school_week(now()) + time '12:00')::timestamptz;
begin
  perform as_user(3);
  c := (create_class('Goal Room', 5)->>'id')::uuid;
  perform as_admin();
  insert into class_members (class_id, child_id) values (c, u(172)), (c, u(173)), (c, u(174));

  perform as_user(172);
  perform expect_error(format($q$select class_goal_set(%L, 1)$q$, c), 'not your class');
  assert (class_goal_status())->>'on' = 'false', 'no goal until the teacher turns it on';

  perform as_user(3);
  perform expect_error(format($q$select class_goal_set(%L, 9)$q$, c), 'check');
  perform class_goal_set(c, 1, 80);

  -- two of three practiced on Monday: 67 percent, not enough
  perform as_admin();
  insert into question_history (child_id, question_id, answered_at, correct) values (u(172), 'cg5-1', v_mon, true), (u(173), 'cg5-1', v_mon, true);
  perform as_user(172);
  s := class_goal_status();
  assert (s->>'met')::boolean = false and (s->>'my_days')::int = 1, 'not met with two of three';
  perform expect_error($q$select class_goal_claim()$q$, 'nothing to claim');

  -- the third joins in: the day counts and the goal is met
  perform as_admin();
  insert into question_history (child_id, question_id, answered_at, correct) values (u(174), 'cg5-1', v_mon, true);
  perform as_user(172);
  s := class_goal_status();
  assert (s->>'met')::boolean and (s->>'can_claim')::boolean, 'met and claimable';
  r := class_goal_claim();
  assert (r->>'coins')::int = 20, 'paid';
  perform expect_error($q$select class_goal_claim()$q$, 'nothing to claim');
  perform as_admin();
  assert (select count(*) from ledger_entries where child_id = u(172) and idempotency_key like 'goal:%' and currency = 'coins') = 1, 'paid once';

  -- outsiders cannot look; the teacher sees progress but cannot claim; turning it off hides it
  perform as_user(175);
  assert class_goal_status() is null, 'outsider has no class';
  perform as_user(3);
  s := class_goal_status(c);
  assert s->>'role' = 'teacher' and (s->>'days_hit')::int = 1, 'teacher view';
  perform class_goal_off(c);
  assert (class_goal_status(c))->>'on' = 'false', 'off';
end $$;
