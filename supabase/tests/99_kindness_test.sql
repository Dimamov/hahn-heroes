-- Kindness points: squad mates only, once a day, preset reasons, a grown-up approves, capped at 3 a week.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(145, 148) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(145), 'KNAAAAA2', 'Kind A', 5, 'ana'), (u(146), 'KNBBBBB2', 'Kind B', 5, 'ana'), (u(147), 'KNCCCCC2', 'Kind C', 5, 'ana'), (u(148), 'KNDDDDD2', 'Kind D', 5, 'ana');

do $$
declare v_squad uuid; v_class uuid; v_id bigint; v_other bigint; r jsonb; i int;
begin
  perform as_admin();
  insert into squads (leader, name) values (u(145), 'Kind Squad') returning id into v_squad;
  insert into squad_members (squad_id, child_id, status) values (v_squad, u(145), 'member'), (v_squad, u(146), 'member'), (v_squad, u(147), 'member');
  insert into classes (teacher_id, name, grade, join_code) values (u(3), 'Kind Class', 5, 'KNCLASS2') returning id into v_class;
  insert into class_members (class_id, child_id) values (v_class, u(146));

  perform as_user(145);
  assert jsonb_array_length(kind_state()->'mates') = 2, 'two squad mates';
  perform expect_error(format($q$select kind_nominate(%L, 'my own words')$q$, u(146)), 'one of the reasons');
  perform expect_error(format($q$select kind_nominate(%L, 'cheered')$q$, u(145)), 'squad mate');
  perform expect_error(format($q$select kind_nominate(%L, 'cheered')$q$, u(148)), 'squad mate');
  perform kind_nominate(u(146), 'cheered');
  perform expect_error(format($q$select kind_nominate(%L, 'teamwork')$q$, u(147)), 'already nominated');
  assert (kind_state()->>'nominated_today')::boolean, 'state shows it';

  perform as_user(146);
  assert jsonb_array_length(kind_state()->'received') = 0, 'nothing approved yet';
  perform expect_error('select kind_review()', 'only teachers');
  perform as_user(3);
  r := kind_review();
  assert jsonb_array_length(r) = 1 and r->0->>'nominee' = 'Kind B' and r->0->>'nominator' = 'Kind A', 'teacher sees their student';
  v_id := (r->0->>'id')::bigint;
  perform as_user(2);
  perform expect_error(format($q$select kind_decide(%s, true)$q$, v_id), 'not your student');
  perform as_user(3);
  assert (kind_decide(v_id, true)->>'awarded')::int = 5, 'approved pays 5';
  perform expect_error(format($q$select kind_decide(%s, true)$q$, v_id), 'not waiting');
  perform as_user(146);
  assert kind_state()->'received'->0->>'reason' = 'cheered' and not (kind_state()->'received'->0 ? 'nominator'), 'nominee sees the reason only';

  -- weekly cap of 3 paid; skipping pays nothing; a teacher cannot decide for a student who is not theirs
  perform as_admin();
  insert into kind_nominations (nominator, nominee, reason, day) values
    (u(145), u(146), 'teamwork', current_date - 1), (u(147), u(146), 'included', current_date - 1),
    (u(147), u(146), 'taught', current_date - 2), (u(146), u(147), 'positive', current_date - 3);
  select id into v_other from kind_nominations where nominee = u(147);
  perform as_user(3);
  perform expect_error(format($q$select kind_decide(%s, true)$q$, v_other), 'not your student');
  perform as_user(4);
  for v_id in select (e->>'id')::bigint from jsonb_array_elements(kind_review()) e where e->>'nominee' = 'Kind B' loop
    i := coalesce(i, 0) + 1;
    assert (kind_decide(v_id, true)->>'awarded')::int = case when i <= 2 then 5 else 0 end, 'cap of 3 a week';
  end loop;
  assert (kind_decide(v_other, false)->>'awarded')::int = 0, 'skip pays nothing';
  perform as_admin();
  assert (select coalesce(sum(amount), 0) from ledger_entries where child_id = u(146) and reason = 'Kindness') = 15, 'fifteen diamonds in the week';
  delete from ledger_entries where child_id in (u(145), u(146), u(147));
  delete from kind_nominations;
  delete from class_members where class_id = v_class; delete from classes where id = v_class;
  delete from squad_members where squad_id = v_squad; delete from squads where id = v_squad;
end $$;

delete from auth.users where id between u(145) and u(148);
