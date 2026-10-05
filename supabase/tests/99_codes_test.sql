-- Secret codes: class codes for the class only, caps, one a day for teachers, redeem once, guess limit.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(126, 128) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(126), 'KDAAAAA2', 'Code A', 5, 'ana'), (u(127), 'KDBBBBB2', 'Code B', 5, 'ana'), (u(128), 'KDCCCCC2', 'Code C', 5, 'ana');

do $$
declare v_class uuid; v_code text; v_sen text; r jsonb; v_before int;
begin
  perform as_admin();
  insert into classes (teacher_id, name, grade, join_code) values (u(3), 'Code Class', 5, 'KDCLASS2') returning id into v_class;
  insert into class_members (class_id, child_id) values (v_class, u(126)), (v_class, u(127));

  perform as_user(126);
  perform expect_error(format($q$select code_create(%L, 1, 1)$q$, v_class), 'pick one of your classes');
  perform as_user(3);
  perform expect_error(format($q$select code_create(%L, 6, 0)$q$, v_class), 'up to 5 diamonds');
  perform expect_error(format($q$select code_create(%L, 0, 26)$q$, v_class), '25 stars');
  perform expect_error(format($q$select code_create(%L, 0, 0)$q$, v_class), 'at least something');
  v_code := code_create(v_class, 5, 20);
  perform expect_error(format($q$select code_create(%L, 1, 1)$q$, v_class), 'already made a code today');
  assert jsonb_array_length(code_mine()) = 1 and code_mine()->0->>'code' = v_code, 'teacher sees the code';

  perform as_user(126);
  assert not (code_redeem('nope')->>'ok')::boolean, 'wrong word';
  r := code_redeem(lower(v_code));
  assert (r->>'ok')::boolean and (r->>'coins')::int = 5 and (r->>'xp')::int = 20, 'redeemed, case free';
  assert code_redeem(v_code)->>'reason' = 'already_used', 'only once';
  perform as_user(128);
  assert code_redeem(v_code)->>'reason' = 'not_found', 'not in the class';
  perform as_user(127);
  assert (code_redeem(v_code)->>'ok')::boolean, 'classmate redeems';

  -- the Sensei: school-wide, announcement, five a day
  perform as_user(4);
  v_sen := code_create(null, 40, 100, true);
  assert exists (select 1 from announcements where body like '%' || v_sen), 'announced';
  perform expect_error($q$select code_create(null, 51, 0)$q$, 'too much');
  perform code_create(null, 1, 0); perform code_create(null, 1, 0); perform code_create(null, 1, 0); perform code_create(null, 1, 0);
  perform expect_error($q$select code_create(null, 1, 0)$q$, 'five codes a day');
  perform as_user(128);
  assert (code_redeem(v_sen)->>'ok')::boolean, 'school-wide code works for anyone';

  -- guess limit
  perform as_user(126);
  perform code_redeem('A-A-1'); perform code_redeem('A-A-2'); perform code_redeem('A-A-3'); perform code_redeem('A-A-4'); perform code_redeem('A-A-5');
  assert code_redeem(v_sen)->>'reason' = 'too_many_tries', 'locked after five wrong guesses';

  perform as_admin();
  delete from redeem_attempts; delete from redeem_codes; delete from announcements where title = 'Secret code!';
  delete from class_members where class_id = v_class; delete from classes where id = v_class;
end $$;

delete from auth.users where id in (u(126), u(127), u(128));
