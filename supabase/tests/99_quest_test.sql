-- Daily streaks and the daily quest.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(95, 96) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(95), 'QSAAAAA2', 'Qst A', 5, 'ana'), (u(96), 'QSBBBBB2', 'Qst B', 5, 'ana');

do $$
declare r jsonb; i int;
begin
  perform as_admin();
  -- two days ago and yesterday, a gap before that
  perform award(u(95), 'coins', 3, 'daily', 'x', 'daily:' || (school_date(now()) - 2));
  perform award(u(95), 'coins', 3, 'daily', 'x', 'daily:' || (school_date(now()) - 1));
  perform award(u(95), 'coins', 3, 'daily', 'x', 'daily:' || (school_date(now()) - 5));
  perform as_user(95);
  r := quest_state();
  assert (r->>'streak')::int = 2, 'two days so far (yesterday counts until today ends): ' || r::text;
  perform claim_daily_reward();
  r := quest_state();
  assert (r->>'streak')::int = 3, 'three days with today: ' || r::text;
  assert (r->'milestones'->0->>'reached')::boolean and not (r->'milestones'->1->>'reached')::boolean, 'first milestone reached';
  perform expect_error($q$select streak_claim(7)$q$, 'not there yet');
  perform expect_error($q$select streak_claim(5)$q$, 'no such milestone');
  assert (streak_claim(3)->>'awarded')::int = 5, 'milestone pays 5';
  assert (streak_claim(3)->>'duplicate')::boolean, 'only once per run';

  -- the quest needs all three tasks
  perform expect_error($q$select quest_claim()$q$, 'finish all three');
  perform as_admin();
  for i in 1..3 loop perform award(u(95), 'coins', 2, 'learning', 'x', 'learn:q' || i); end loop;
  perform award(u(95), 'coins', 3, 'game', 'x', 'arcade:flip:' || school_date(now()));
  perform as_user(95);
  r := quest_state();
  assert (select bool_and((t->>'have')::int >= (t->>'need')::int) from jsonb_array_elements(r->'tasks') t), 'all tasks done';
  assert (quest_claim()->>'awarded')::int = 10, 'quest pays 10';
  assert (quest_claim()->>'duplicate')::boolean, 'once a day';
  assert (quest_state()->>'quest_claimed')::boolean, 'claimed';

  perform as_user(96);
  assert (quest_state()->>'streak')::int = 0, 'other hero has no streak';
end $$;
