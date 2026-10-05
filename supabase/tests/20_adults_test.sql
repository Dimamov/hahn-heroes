-- Parents, teachers, the Sensei, missions, announcements and the sign-up limit.
\set ON_ERROR_STOP on

create function public.u(n int) returns uuid language sql immutable as $$
  select ('aaaaaaaa-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function public.as_user(n int) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', u(n)::text, false);
  set role authenticated;
end $$;
create function public.as_admin() returns void language plpgsql as $$
begin reset role; end $$;
create function public.expect_error(p_sql text, p_fragment text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'EXPECTED_ERROR_MISSING: wanted %', p_fragment;
exception when others then
  if sqlerrm like 'EXPECTED_ERROR_MISSING%' then raise; end if;
  if position(p_fragment in sqlerrm) = 0 then raise exception 'wrong error: % (wanted %)', sqlerrm, p_fragment; end if;
end $$;

insert into auth.users (id, email) values
  (u(1), 'pat@example.com'), (u(2), 'pam@example.com'), (u(3), 'tess@example.com'), (u(4), 'sensei@example.com'),
  (u(11), null), (u(12), null), (u(13), null);
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(11), 'QKAAAAA2', 'Brave Comet', 5, 'ana'),
  (u(12), 'QKBBBBB2', 'Swift Owl', 6, 'b03'),
  (u(13), 'QKCCCCC2', 'Bold Fox', 5, 'luna');
insert into public.adults (id, role, display_name, approved) values (u(4), 'sensei', 'The Sensei', true);

-- Sign-up rules.
select as_user(1);
do $$
declare r jsonb;
begin
  r := register_adult('parent', 'Pat Parent');
  assert (r->>'approved')::boolean, 'parents are approved right away';
  perform expect_error($q$select register_adult('sensei', 'Boss')$q$, 'role must be parent or teacher');
end $$;
select as_user(11);
select expect_error($q$select register_adult('parent', 'Kid Adult')$q$, 'students cannot be grown-ups');
select as_user(2); select register_adult('parent', 'Pam Parent');
select as_user(3); select register_adult('teacher', 'Tess Teacher');

-- Linking a parent to a child.
select as_user(11);
do $$
declare a jsonb; b jsonb;
begin
  a := create_link_code(); b := create_link_code();
  assert a->>'code' = b->>'code', 'the same unused code comes back';
  assert length(a->>'code') = 8;
  perform set_config('test.code', a->>'code', false);
  perform expect_error($q$select claim_link_code('x')$q$, 'only parents');
end $$;
select as_user(2);
do $$
declare r jsonb;
begin
  for i in 1 .. 10 loop
    r := claim_link_code('WRONG' || i);
    assert r->>'error' = 'invalid_code';
  end loop;
  r := claim_link_code(current_setting('test.code'));
  assert r->>'error' = 'too_many_tries', 'ten wrong codes rest the parent, even for a right code';
end $$;
select as_user(1);
do $$
declare r jsonb;
begin
  r := claim_link_code(lower(substr(current_setting('test.code'), 1, 4)) || '-' || substr(current_setting('test.code'), 5));
  assert (r->>'ok')::boolean and r->>'display_name' = 'Brave Comet', 'code works with dash and lowercase';
  r := claim_link_code(current_setting('test.code'));
  assert r->>'error' = 'invalid_code', 'a code works once';
  assert jsonb_array_length(my_children()) = 1;
  assert (select count(*) from heroes where id = u(11)) = 1, 'parent reads the linked child';
  assert (select count(*) from heroes where id = u(12)) = 0, 'parent cannot read other children';
end $$;

-- Home missions and the weekly cap.
do $$
declare m uuid; r jsonb; total int := 0;
begin
  perform expect_error(format($q$select create_home_mission(%L, 'Dishes', '', 10)$q$, u(12)), 'not your child');
  perform expect_error(format($q$select create_home_mission(%L, 'Big', '', 500)$q$, u(11)), 'violates check constraint');
  m := create_home_mission(u(11), 'Dishes', 'After dinner', 50);
  perform set_config('test.mission', m::text, false);
end $$;
select as_user(12);
do $$ begin
  assert (select count(*) from home_missions) = 0, 'other kids see no home missions';
  perform expect_error(format($q$select submit_home_mission(%L)$q$, current_setting('test.mission')::uuid), 'not available');
end $$;
select as_user(11);
do $$ begin
  assert (select count(*) from home_missions) = 1;
  perform expect_error(format($q$select review_home_mission(%L, true)$q$, current_setting('test.mission')::uuid), 'mission not found');
  perform submit_home_mission(current_setting('test.mission')::uuid);
  perform expect_error(format($q$select submit_home_mission(%L)$q$, current_setting('test.mission')::uuid), 'not available');
end $$;
select as_user(1);
do $$
declare r jsonb; m uuid; total int := 0;
begin
  assert ((my_children() -> 0) ->> 'waiting')::int = 1, 'parent sees one waiting';
  r := review_home_mission(current_setting('test.mission')::uuid, true);
  assert (r->>'awarded')::int = 50;
  perform expect_error(format($q$select review_home_mission(%L, true)$q$, current_setting('test.mission')::uuid), 'not waiting');
  -- Six more missions of 100 each: only 450 more coins fit under the 500 weekly cap.
  for i in 1 .. 6 loop
    m := create_home_mission(u(11), 'Chore ' || i, '', 100);
    perform as_user(11); perform submit_home_mission(m); perform as_user(1);
    r := review_home_mission(m, true);
    total := total + (r->>'awarded')::int;
  end loop;
  assert total = 450, 'cap trims the rest: ' || total;
  r := child_progress(u(11));
  assert (r->>'home_week')::int = 500 and (r->>'home_cap')::int = 500;
end $$;
-- Sending back and redoing.
do $$
declare m uuid; r jsonb;
begin
  m := create_home_mission(u(11), 'Room', '', 10);
  perform as_user(11); perform submit_home_mission(m); perform as_user(1);
  r := review_home_mission(m, false);
  assert r->>'status' = 'sent_back';
  perform as_user(11); perform submit_home_mission(m);   -- the child can try again
end $$;

-- Teachers need the Sensei's approval, then run a class.
select as_user(3);
select expect_error($q$select create_class('Room 12', 5)$q$, 'only approved teachers');
select as_user(1);
select expect_error($q$select list_pending_teachers()$q$, 'only the Sensei');
select as_user(4);
do $$ begin
  assert jsonb_array_length(list_pending_teachers()) = 1;
  assert (list_pending_teachers() -> 0 ->> 'email') = 'tess@example.com';
  perform approve_teacher(u(3), true);
  assert (sensei_overview() ->> 'teachers')::int = 1 and (sensei_overview() ->> 'heroes')::int >= 3;
end $$;
select as_user(3);
do $$
declare c jsonb; q jsonb; m uuid;
begin
  c := create_class('Room 12', 5);
  perform set_config('test.class', c->>'id', false);
  perform set_config('test.join', c->>'join_code', false);
  assert length(c->>'join_code') = 6;
  q := '[{"prompt":"Q1","choices":["a","b","c"]},{"prompt":"Q2","choices":["a","b"]},{"prompt":"Q3","choices":["a","b","c"]},
         {"prompt":"Q4","choices":["a","b","c"]},{"prompt":"Q5","choices":["a","b","c"]}]';
  perform expect_error(format($x$select create_class_mission(%L, 'Bad', '', '[{"prompt":"only","choices":["a","b"]}]', '[0]', '["x"]', 40)$x$, (c->>'id')::uuid), '3 to 10 questions');
  perform expect_error(format($x$select create_class_mission(%L, 'Bad', '', %L, '[0,1,0,0,9]', '["","","","",""]', 40)$x$, (c->>'id')::uuid, q), 'question 5 is not valid');
  m := create_class_mission((c->>'id')::uuid, 'Reading check', 'The fox ran home.', q,
                            '[0,1,2,0,1]', '["because","yes","c","a","b"]', 40);
  perform set_config('test.cm', m::text, false);
end $$;
select as_user(1);
select expect_error(format($q$select create_class_mission(%L, 'Hack', '', '[]', '[]', '[]', 10)$q$, current_setting('test.class')::uuid), 'not your class');

-- Students join (grade checked) and take the mission once.
select as_user(11);
do $$
declare r jsonb;
begin
  assert (join_class('NOPE12')->>'error') = 'invalid_code';
  r := join_class(lower(current_setting('test.join')));
  assert (r->>'ok')::boolean;
  assert (join_class(current_setting('test.join'))->>'error') = 'already_in_class';
end $$;
select as_user(12);
do $$ begin assert (join_class(current_setting('test.join'))->>'error') = 'wrong_grade', 'grade 6 cannot join a grade 5 class'; end $$;
select as_user(13); select join_class(current_setting('test.join'));

select as_user(11);
do $$
declare r jsonb;
begin
  assert (select count(*) from class_missions) = 1, 'member sees the mission';
  assert (select count(*) from class_mission_keys) = 0, 'students never see the answer key';
end $$;
do $$
declare r jsonb;
begin
  -- 4 of 5 right = 80%: passes, earns round(40 * 30/50) = 24 coins.
  r := submit_class_mission(current_setting('test.cm')::uuid, '[0,1,2,0,0]');
  assert (r->>'score_pct')::int = 80 and (r->>'passed')::boolean and (r->>'coins')::int = 24, r::text;
  assert jsonb_array_length(r->'review') = 5 and (r->'review' -> 4 ->> 'right_choice')::int = 1, 'feedback after answering';
  r := submit_class_mission(current_setting('test.cm')::uuid, '[0,1,2,0,1]');
  assert (r->>'already_done')::boolean and (r->>'coins')::int = 24, 'one try only';
end $$;
select as_user(13);
do $$
declare r jsonb;
begin
  r := submit_class_mission(current_setting('test.cm')::uuid, '[0,0,0,0,0]');
  assert (r->>'score_pct')::int = 40 and not (r->>'passed')::boolean and (r->>'coins')::int = 0;
end $$;
select as_user(12);
select expect_error(format($q$select submit_class_mission(%L, '[0,1,2,0,1]')$q$, current_setting('test.cm')::uuid), 'mission not found');

-- A teacher reset allows a retake but never a second payout.
select as_user(3);
do $$ begin
  assert (select count(*) from class_submissions) = 2, 'teacher sees their class results';
  assert (select count(*) from class_mission_keys) = 1, 'teacher reads the key';
  assert (select count(*) from heroes where id in (u(11), u(13))) = 2, 'teacher reads their students';
  assert (select count(*) from heroes where id = u(12)) = 0;
  perform teacher_reset_submission(current_setting('test.cm')::uuid, u(11));
end $$;
select as_user(11);
do $$
declare r jsonb; before int; after_ int;
begin
  select coalesce(sum(amount), 0) into before from ledger_entries where source = 'class_mission';
  r := submit_class_mission(current_setting('test.cm')::uuid, '[0,1,2,0,1]');
  assert (r->>'score_pct')::int = 100 and (r->>'coins')::int = 0, 'retake pays nothing more: ' || r::text;
  select coalesce(sum(amount), 0) into after_ from ledger_entries where source = 'class_mission';
  assert before = after_ and before = 24;
end $$;

-- Announcements and the unread dot.
select as_user(11);
do $$ begin
  assert unread_announcements() = 0;
  perform expect_error($q$select post_announcement('Hi', 'there')$q$, 'only the Sensei');
end $$;
select as_user(4);
select post_announcement('Trivia Night', 'Thursday at 6:30');
select as_user(11);
do $$ begin
  assert unread_announcements() = 1;
  perform mark_announcements_read();
  assert unread_announcements() = 0;
end $$;
select as_user(13);
do $$ begin assert unread_announcements() = 1, 'read marks are per person'; end $$;

-- The Sensei can remove an old announcement; it disappears for everyone and from the unread count.
select as_user(4);
select post_announcement('Old news', 'Remove me');
select as_user(13);
do $$ begin assert unread_announcements() = 2, 'new one counts'; end $$;
select as_user(11);
do $$ begin
  perform expect_error($q$select sensei_delete_announcement(1)$q$, 'only the Sensei');
end $$;
select as_user(4);
do $$
declare v_id bigint;
begin
  select id into v_id from announcements where title = 'Old news';
  perform sensei_delete_announcement(v_id);
  perform expect_error(format($q$select sensei_delete_announcement(%s)$q$, v_id), 'no such announcement');
  assert (select count(*) from announcements) = 1, 'removed announcement is hidden';
end $$;
select as_user(13);
do $$ begin assert unread_announcements() = 1, 'back to one unread'; end $$;

-- Sensei settings.
select as_user(4);
do $$ begin
  perform sensei_set_setting('trivia_night', '{"weekday":"friday","time":"19:00"}');
  perform sensei_set_setting('daily_login_coins', '15');
  perform expect_error($q$select sensei_set_setting('trivia_night', '{"weekday":"funday","time":"19:00"}')$q$, 'weekday');
  perform expect_error($q$select sensei_set_setting('daily_login_coins', '500')$q$, '0 to 100');
  perform expect_error($q$select sensei_set_setting('weekly_caps', '{}')$q$, 'cannot be changed');
  assert (sensei_overview() -> 'trivia_night' ->> 'weekday') = 'friday';
end $$;
select as_user(1);
select expect_error($q$select sensei_set_setting('daily_login_coins', '99')$q$, 'only the Sensei');

-- Nobody can write tables directly or call server-only functions.
select as_user(1);
do $$ begin
  perform expect_error($q$insert into adults (id, role, display_name, approved) values (gen_random_uuid(), 'sensei', 'Me', true)$q$, 'permission denied');
  perform expect_error($q$update adults set role = 'sensei'$q$, 'permission denied');
  perform expect_error($q$insert into parent_links (child_id, parent_id) values (u(12), u(1))$q$, 'permission denied');
  perform expect_error($q$update home_missions set status = 'approved'$q$, 'permission denied');
  perform expect_error($q$select check_signup('1.2.3.4')$q$, 'permission denied');
  perform expect_error($q$select * from code_attempts$q$, 'permission denied');
end $$;

-- Limit on new heroes (called by the sign-up function with the service role).
select as_admin();
update app_settings set value = '{"per_ip_per_hour": 2, "global_per_hour": 400}' where key = 'signup_limits';
set role service_role;
do $$ begin
  assert (check_signup('9.9.9.9')->>'allowed')::boolean;
  assert (check_signup('9.9.9.9')->>'allowed')::boolean;
  assert not (check_signup('9.9.9.9')->>'allowed')::boolean, 'third hero from one network in an hour is refused';
  assert (check_signup('8.8.8.8')->>'allowed')::boolean, 'another network is fine';
end $$;
reset role;
update app_settings set value = '{"per_ip_per_hour": 1, "global_per_hour": 3}' where key = 'signup_limits';
delete from signup_log;
set role service_role;
do $$ begin
  perform check_signup('1.1.1.1'); perform check_signup('2.2.2.2'); perform check_signup('3.3.3.3');
  assert not (check_signup('4.4.4.4')->>'allowed')::boolean, 'overall limit applies too';
end $$;
reset role;
select 'adult and mission tests passed' as result;
