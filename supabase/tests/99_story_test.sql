-- Story: progress, choices, checkpoints and the completion card.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(91, 92) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(91), 'STAAAAA2', 'Sto A', 5, 'ana'), (u(92), 'STBBBBB2', 'Sto B', 6, 'ana');

do $$
declare r jsonb;
begin
  perform as_user(91);
  r := story_state();
  assert jsonb_array_length(r) = 1 and (r->0->>'panel')::int = 0 and (r->0->>'completed')::boolean = false, 'fresh reader';
  perform story_save('ep1', 4);
  perform story_save('ep1', 2);
  assert (story_state()->0->>'panel')::int = 4, 'progress only moves forward';
  perform expect_error($q$select story_save('nope', 1)$q$, 'no such episode');

  -- a choice pays once, whatever the second pick is
  r := story_choose('ep1', 'touch', 'ana');
  assert (r->>'amount')::int = 5 and r->>'currency' = 'coins' and (r->>'repeat')::boolean = false, 'choice reward';
  r := story_choose('ep1', 'touch', 'isabella');
  assert (r->>'repeat')::boolean and r->>'option' = 'ana', 'first pick stays';
  perform expect_error($q$select story_choose('ep1', 'touch', 'nobody')$q$, 'no such choice');

  -- checkpoints: wrong answers are free to retry; right answers pay once
  assert (story_answer('ep1', 'cp1', 0)->>'correct')::boolean = false, 'wrong';
  perform expect_error($q$select story_answer('ep1', 'cp1', 9)$q$, 'pick one');
  r := story_answer('ep1', 'cp1', 1);
  assert (r->>'correct')::boolean and (r->>'first')::boolean and r->>'explanation' like '%60 crystals%', 'right';
  assert not (story_answer('ep1', 'cp1', 1)->>'first')::boolean, 'second time pays nothing';
  perform expect_error($q$select story_complete('ep1')$q$, 'every checkpoint');
  perform story_answer('ep1', 'cp2', 0);
  perform story_answer('ep1', 'cp3', 2);

  r := story_complete('ep1');
  assert not (r->>'repeat')::boolean and r->>'card' = 'e-keeper' and (r->>'coins')::int = 20, 'finished';
  assert (story_complete('ep1')->>'repeat')::boolean, 'finishing twice pays nothing more';

  perform as_admin();
  assert (select sum(amount) from ledger_entries where child_id = u(91) and currency = 'coins' and idempotency_key like 'story:%') = 5 + 15 + 20, 'coins: choice 5, three checkpoints 15, finish 20';
  assert (select qty from hero_cards where hero_id = u(91) and card_id = 'e-keeper') = 1, 'one card';
  perform as_user(92);
  assert (story_state()->0->>'panel')::int = 0 and jsonb_array_length(story_state()->0->'solved') = 0, 'other hero untouched';
end $$;
