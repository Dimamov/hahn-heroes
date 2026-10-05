-- Room contest: votes only inside the squad/House circle, one vote a week, winners claim once.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(122, 125) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(122), 'CNAAAAA2', 'Con A', 5, 'ana'), (u(123), 'CNBBBBB2', 'Con B', 5, 'ana'), (u(124), 'CNCCCCC2', 'Con C', 5, 'ana'), (u(125), 'CNDDDDD2', 'Con D', 5, 'ana');

do $$
declare v_squad uuid; v_week date := school_week(now()); v_last date := school_week(now()) - 7; r jsonb;
begin
  perform as_admin();
  insert into squads (leader, name) values (u(122), 'Contest Squad') returning id into v_squad;
  insert into squad_members (squad_id, child_id, status) values (v_squad, u(122), 'member'), (v_squad, u(123), 'member'), (v_squad, u(124), 'member');

  perform as_user(122);
  perform expect_error('select contest_enter()', 'decorate your room first');
  perform as_admin();
  insert into hero_rooms (hero_id, layout) values (u(122), '[{"item":"x","cell":1}]'), (u(125), '[{"item":"x","cell":1}]');
  perform as_user(122);
  perform contest_enter();
  perform contest_enter();
  perform as_admin();
  assert (select count(*) from contest_entries where week = v_week) = 1, 'entering twice is one entry';
  assert (select count(*) from ledger_entries where child_id = u(122) and idempotency_key = 'contest-enter:' || v_week) = 1, 'entry pays once';
  perform as_user(125);
  perform contest_enter();

  perform as_user(123);
  assert jsonb_array_length(contest_state()->'entries') = 1, 'squad mate sees the squad entry only';
  perform expect_error(format($q$select contest_vote(%L)$q$, u(125)), 'squad or House');
  perform expect_error(format($q$select contest_vote(%L)$q$, u(123)), 'squad or House');
  perform contest_vote(u(122));
  perform expect_error(format($q$select contest_vote(%L)$q$, u(122)), 'already voted');
  assert (contest_state()->>'voted')::boolean, 'state shows voted';
  perform as_user(124);
  assert jsonb_array_length(contest_state()->'entries') = 1, 'C sees A';
  perform as_user(125);
  assert jsonb_array_length(contest_state()->'entries') = 0, 'outsider sees nothing';

  -- last week: A got 2 votes, wins and can claim once; D (outsider) cannot
  perform as_admin();
  insert into contest_entries (week, hero_id) values (v_last, u(122)), (v_last, u(123));
  insert into contest_votes (week, voter, entry) values (v_last, u(123), u(122)), (v_last, u(124), u(122)), (v_last, u(122), u(123));
  perform as_user(122);
  assert (contest_state()->'last'->>'won')::boolean, 'A won last week';
  assert (contest_claim()->>'ok')::boolean, 'claims';
  assert not (contest_claim()->>'ok')::boolean, 'only once';
  perform as_user(123);
  assert not (contest_state()->'last'->>'won')::boolean and not (contest_claim()->>'ok')::boolean, 'B did not win';
  perform as_user(125);
  assert not (contest_claim()->>'ok')::boolean, 'D has no votes';

  perform as_admin();
  delete from contest_votes; delete from contest_entries; delete from contest_claims;
  delete from hero_rooms where hero_id in (u(122), u(125));
  delete from squad_members where squad_id = v_squad; delete from squads where id = v_squad;
end $$;

delete from auth.users where id in (u(122), u(123), u(124), u(125));
