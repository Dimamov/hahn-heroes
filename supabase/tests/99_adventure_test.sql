-- Mystery Lab and Chronicle Quest.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(93, 94) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(93), 'ADAAAAA2', 'Adv A', 5, 'ana'), (u(94), 'ADBBBBB2', 'Adv B', 6, 'ana');

do $$
declare r jsonb;
begin
  perform as_user(93);
  assert jsonb_array_length(adv_state()) = 3, 'three cases';
  perform expect_error($q$select adv_answer('lab1', 'nope', 0)$q$, 'no such step');
  perform expect_error($q$select adv_answer('lab1', 'q1', 7)$q$, 'pick one');
  assert (adv_answer('lab1', 'q1', 0)->>'correct')::boolean = false, 'wrong is free to retry';
  r := adv_answer('lab1', 'q1', 1);
  assert (r->>'correct')::boolean and (r->>'first')::boolean and r->>'explanation' like '%blue%', 'right';
  assert not (adv_answer('lab1', 'q1', 1)->>'first')::boolean, 'no second payout';
  perform expect_error($q$select adv_complete('lab1')$q$, 'every question');
  perform adv_answer('lab1', 'q2', 0);
  perform adv_answer('lab1', 'q3', 2);
  r := adv_complete('lab1');
  assert not (r->>'repeat')::boolean and r->>'card' = 'u-key' and (r->>'coins')::int = 15, 'solved';
  assert (adv_complete('lab1')->>'repeat')::boolean, 'twice pays nothing';

  -- the Chronicle trail opens in order
  perform expect_error($q$select adv_answer('chron1', 's2', 0)$q$, 'sealed');
  perform adv_answer('chron1', 's1', 1);
  perform adv_answer('chron1', 's2', 0);
  perform expect_error($q$select adv_answer('chron1', 's4', 1)$q$, 'sealed');
  perform adv_answer('chron1', 's3', 2);
  perform adv_answer('chron1', 's4', 1);
  perform adv_answer('chron1', 's5', 0);
  assert (adv_complete('chron1')->>'coins')::int = 30, 'trail finished';

  perform as_admin();
  assert (select sum(amount) from ledger_entries where child_id = u(93) and currency = 'coins' and idempotency_key like 'adv:%') = 15 + 15 + 25 + 30, 'coins: 3 lab steps 15 + prize 15, 5 chronicle steps 25 + prize 30';
  perform as_user(94);
  assert (select count(*) from jsonb_array_elements(adv_state()) c where (c->>'done')::boolean) = 0, 'other hero untouched';
end $$;
