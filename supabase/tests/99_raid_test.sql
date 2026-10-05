-- School boss raid: one strike a day, power from right answers, one reward after the boss falls.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(111, 112) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(111), 'RDAAAAA2', 'Raid A', 5, 'ana'), (u(112), 'RDBBBBB2', 'Raid B', 5, 'ana');

do $$
declare r jsonb; v_week date := school_week(now());
begin
  perform as_admin();
  insert into questions (id, subject, grade, skill, difficulty, prompt, choices)
  select 'rd-' || n, 'math', 5, 'fractions', 1, 'Q', '["a","b"]'::jsonb from generate_series(1, 4) n;
  insert into question_history (child_id, question_id, answered_at, correct)
  select u(111), 'rd-' || n, now(), true from generate_series(1, 4) n;

  perform as_user(111);
  r := raid_state();
  assert (r->>'max_hp')::int >= 400 and not (r->>'defeated')::boolean and not (r->>'struck_today')::boolean, 'fresh boss: ' || r::text;
  assert (r->>'power')::int = 22, 'power is 10 + 3 per right answer: ' || r::text;
  r := raid_strike();
  assert (r->>'ok')::boolean and (r->>'damage')::int = 22, 'first strike';
  assert not (raid_strike()->>'ok')::boolean and raid_strike()->>'reason' = 'already_struck', 'one a day';
  assert (raid_state()->>'damage')::int = 22 and (raid_state()->>'my_damage')::int = 22, 'damage counted';
  assert raid_claim()->>'reason' = 'not_defeated', 'cannot claim early';

  perform as_user(112);
  assert raid_claim()->>'reason' = 'not_defeated', 'cannot claim early either';
  assert (raid_strike()->>'damage')::int = 10, 'just showing up is 10';

  -- bring the boss down
  perform as_admin();
  update raid_weeks set max_hp = 40 where week = v_week;
  insert into raid_strikes (hero_id, day, week, damage) values (u(111), school_date(now()) - 1, v_week, 30);
  perform as_user(111);
  assert (raid_state()->>'defeated')::boolean and (raid_state()->>'can_claim')::boolean, 'defeated';
  r := raid_claim();
  assert (r->>'ok')::boolean, 'claim: ' || r::text;
  assert not (raid_state()->>'can_claim')::boolean and (raid_state()->>'claimed')::boolean, 'claimed once';
  assert (raid_claim()->>'duplicate')::boolean is not false, 'second claim does not pay twice';
  perform as_user(112);
  assert (raid_state()->>'can_claim')::boolean, 'a striker can claim';
  perform as_admin();
  delete from raid_strikes; delete from raid_weeks;
end $$;

delete from auth.users where id in (u(111), u(112));
delete from public.questions where id like 'rd-%';
