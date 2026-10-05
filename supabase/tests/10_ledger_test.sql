-- Reward ledger and sign-in rules. Each block raises an error if a rule is broken.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  ('00000000-0000-0000-0000-00000000000a', 'ABCDEFGH', 'Brave Comet', 5, 'ana'),
  ('00000000-0000-0000-0000-00000000000b', 'JKMNPQRS', 'Swift Owl', 6, 'b03');

-- Awards pay once per key.
do $$
declare r jsonb;
begin
  r := award('00000000-0000-0000-0000-00000000000a', 'xp', 25, 'learning', 'Quiz', 'quiz:1');
  assert (r->>'awarded')::int = 25, 'first award pays';
  r := award('00000000-0000-0000-0000-00000000000a', 'xp', 25, 'learning', 'Quiz', 'quiz:1');
  assert (r->>'duplicate')::boolean and (r->>'awarded')::int = 0, 'replayed key pays nothing';
end $$;

-- Mission coins stop at 500 per week, Home and Class counted separately.
do $$
declare r jsonb;
begin
  r := award('00000000-0000-0000-0000-00000000000a', 'coins', 300, 'home_mission', 'Chores', 'home:1');
  assert (r->>'awarded')::int = 300;
  r := award('00000000-0000-0000-0000-00000000000a', 'coins', 300, 'home_mission', 'Chores', 'home:2');
  assert (r->>'awarded')::int = 200 and (r->>'capped')::boolean, 'second award is trimmed to the cap';
  r := award('00000000-0000-0000-0000-00000000000a', 'coins', 50, 'home_mission', 'Chores', 'home:3');
  assert (r->>'awarded')::int = 0, 'nothing over the cap';
  r := award('00000000-0000-0000-0000-00000000000a', 'coins', 400, 'class_mission', 'Reading', 'class:1');
  assert (r->>'awarded')::int = 400, 'class cap is separate from home cap';
  r := award('00000000-0000-0000-0000-00000000000a', 'coins', 40, 'game', 'Arcade', 'game:1');
  assert (r->>'awarded')::int = 40, 'other sources are not mission-capped';
end $$;

-- Last week's coins don't count toward this week's cap.
do $$
declare r jsonb;
begin
  insert into ledger_entries (child_id, currency, amount, requested, source, reason, idempotency_key, school_week)
  values ('00000000-0000-0000-0000-00000000000b', 'coins', 500, 500, 'home_mission', 'Old', 'home:old',
          school_week(now()) - 7);
  r := award('00000000-0000-0000-0000-00000000000b', 'coins', 120, 'home_mission', 'Chores', 'home:new');
  assert (r->>'awarded')::int = 120;
end $$;

-- School weeks start on Monday in school time.
do $$
begin
  assert school_week('2026-10-05 12:00-04') = '2026-10-05', 'Monday starts a week';
  assert school_week('2026-10-12 03:30+00') = '2026-10-05', 'Sunday 11:30 pm school time is still last week';
end $$;

-- Spending never goes below zero, never charges twice, and leaves XP alone.
do $$
declare r jsonb; v_coins int; v_xp int;
begin
  r := spend('00000000-0000-0000-0000-00000000000a', 100, 'Jacket', 'buy:jacket');
  assert (r->>'ok')::boolean and (r->>'spent')::int = 100;
  r := spend('00000000-0000-0000-0000-00000000000a', 100, 'Jacket', 'buy:jacket');
  assert (r->>'duplicate')::boolean and (r->>'spent')::int = 0, 'double tap charges once';
  r := spend('00000000-0000-0000-0000-00000000000a', 100000, 'Castle', 'buy:castle');
  assert not (r->>'ok')::boolean, 'cannot overspend';
  select sum(amount) into v_coins from ledger_entries where child_id = '00000000-0000-0000-0000-00000000000a' and currency = 'coins';
  select sum(amount) into v_xp from ledger_entries where child_id = '00000000-0000-0000-0000-00000000000a' and currency = 'xp';
  assert v_coins = 300 + 200 + 400 + 40 - 100, 'coin balance';
  assert v_xp = 25, 'spending does not touch XP';
end $$;

-- The ledger is append-only.
do $$
begin
  begin
    update ledger_entries set amount = 9999;
    raise exception 'update should have failed';
  exception when raise_exception then
    if sqlerrm <> 'ledger entries cannot be changed' then raise; end if;
  end;
end $$;

-- Five wrong tries rest a hero code; a correct one resets the count.
do $$
declare r jsonb;
begin
  for i in 1..4 loop perform record_sign_in('ABCDEFGH', '10.0.0.1', false); end loop;
  r := check_sign_in('ABCDEFGH', '10.0.0.1');
  assert not (r->>'locked')::boolean and (r->>'remaining')::int = 1;
  perform record_sign_in('ABCDEFGH', '10.0.0.1', false);
  r := check_sign_in('ABCDEFGH', '10.0.0.1');
  assert (r->>'locked')::boolean and (r->>'retry_after')::int between 1 and 900, 'locked after 5';
  r := check_sign_in('JKMNPQRS', '10.0.0.1');
  assert not (r->>'locked')::boolean, 'other codes on the same network still work';
  for i in 1..4 loop perform record_sign_in('JKMNPQRS', '10.0.0.2', false); end loop;
  perform record_sign_in('JKMNPQRS', '10.0.0.2', true);
  r := check_sign_in('JKMNPQRS', '10.0.0.2');
  assert (r->>'remaining')::int = 5, 'success resets the count';

  -- repeated wrong tries rest the code for longer: an hour after 10, a day after 15
  for i in 1..9 loop perform record_sign_in('LONGLOCK', '10.0.0.3', false); end loop;
  r := check_sign_in('LONGLOCK', '10.0.0.3');
  assert (r->>'locked')::boolean and (r->>'retry_after')::int <= 900, 'first rest is 15 minutes';
  perform record_sign_in('LONGLOCK', '10.0.0.3', false);
  r := check_sign_in('LONGLOCK', '10.0.0.3');
  assert (r->>'locked')::boolean and (r->>'retry_after')::int between 901 and 3600, 'tenth wrong try rests an hour';
  for i in 1..5 loop perform record_sign_in('LONGLOCK', '10.0.0.3', false); end loop;
  r := check_sign_in('LONGLOCK', '10.0.0.3');
  assert (r->>'locked')::boolean and (r->>'retry_after')::int between 3601 and 86400, 'fifteenth rests a day';
  perform record_sign_in('LONGLOCK', '10.0.0.3', true);
  assert not (check_sign_in('LONGLOCK', '10.0.0.3')->>'locked')::boolean, 'a correct sign-in clears it';
end $$;

-- Students: read only their own rows, write nothing, call only the student functions.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);

do $$
declare n int; r jsonb;
begin
  select count(*) into n from ledger_entries;
  assert n = 2, 'student sees only their own ledger rows, saw ' || n;
  select count(*) into n from heroes;
  assert n = 1, 'student sees only their own hero';
  select balance into n from my_balances where currency = 'coins';
  assert n = 620, 'my_balances';

  r := daily_reward_status();
  assert (r->>'available')::boolean;
  r := claim_daily_reward();
  assert (r->>'awarded')::int = 10;
  r := claim_daily_reward();
  assert (r->>'duplicate')::boolean, 'daily reward pays once per day';
  r := daily_reward_status();
  assert not (r->>'available')::boolean;
end $$;

do $$
begin
  begin
    perform kid_auth_secret();
    raise exception 'student read the kid auth secret';
  exception when insufficient_privilege then null;
  end;
  begin
    perform award('00000000-0000-0000-0000-00000000000b', 'coins', 1000, 'sensei', 'Hack', 'hack:1');
    raise exception 'student called award()';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into ledger_entries (child_id, currency, amount, requested, source, reason, idempotency_key, school_week)
    values ('00000000-0000-0000-0000-00000000000b', 'coins', 1000, 1000, 'sensei', 'Hack', 'hack:2', current_date);
    raise exception 'student inserted into the ledger';
  exception when insufficient_privilege then null;
  end;
  begin
    update heroes set grade = 6;
    raise exception 'student updated a hero';
  exception when insufficient_privilege then null;
  end;
  begin
    perform check_sign_in('ABCDEFGH', null);
    raise exception 'student read sign-in attempts';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'ledger tests passed' as result;
