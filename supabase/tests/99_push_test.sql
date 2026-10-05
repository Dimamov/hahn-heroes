-- Push notifications: opt-in, who is told what, preferences, and the safe delivery hand-off.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(152, 153) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(152), 'PSAAAAA2', 'Push A', 5, 'ana'), (u(153), 'PSBBBBB2', 'Push B', 6, 'ana');

do $$
declare
  v_m uuid; v_n int; c jsonb;
  e_parent text := 'https://push.example.com/send/parent-endpoint-0001';
  e_kid text := 'https://push.example.com/send/kid-endpoint-000002';
  e_other text := 'https://push.example.com/send/other-endpoint-0003';
begin
  perform as_admin();
  insert into parent_links (child_id, parent_id) values (u(152), u(1)) on conflict do nothing;

  -- Nothing is queued for someone who has not opted in.
  insert into home_missions (child_id, parent_id, title, coins) values (u(152), u(1), 'Dishes', 5) returning id into v_m;
  update home_missions set status = 'submitted', submitted_at = now() where id = v_m;
  assert (select count(*) from push_outbox) = 0, 'no opt-in, no messages';

  -- Opt in: parent, kid and another adult.
  perform as_user(1); perform push_subscribe(e_parent, 'p256dh-key-parent-0001', 'auth-secret-parent1');
  perform as_user(152); perform push_subscribe(e_kid, 'p256dh-key-kid-00000002', 'auth-secret-kid-02');
  perform as_user(2); perform push_subscribe(e_other, 'p256dh-key-other-0003', 'auth-secret-other3');
  perform as_user(1);
  c := push_prefs_get();
  assert (c ->> 'chore_waiting')::boolean and (c ->> 'quiet_hours')::boolean, 'defaults on: ' || c::text;
  perform expect_error($q$select push_subscribe('http://insecure.example.com/aaaaaaaaaaaaaaaa', 'p256dh-key-parent-0001', 'auth-secret-parent1')$q$, 'violates check');

  -- Quiet hours off so the test does not depend on the clock.
  perform as_user(1); perform push_prefs_set('{"quiet_hours": false}');
  perform as_user(152); perform push_prefs_set('{"quiet_hours": false}');
  perform as_user(2); perform push_prefs_set('{"quiet_hours": false}');

  -- A chore handed in tells the parent, not the child, and carries no name.
  perform as_admin();
  update home_missions set status = 'sent_back' where id = v_m;
  update home_missions set status = 'submitted', submitted_at = now() where id = v_m;
  assert (select count(*) from push_outbox where kind = 'chore_waiting' and user_id = u(1)) = 1, 'parent told once';
  assert (select count(*) from push_outbox where user_id = u(152)) = 0, 'child not told about their own hand-in';
  assert (select count(*) from push_outbox where user_id = u(2)) = 0, 'a different parent is not told';
  assert (select body from push_outbox where kind = 'chore_waiting') not ilike '%Push A%', 'no names in the message';

  -- Accepting tells the child.
  update home_missions set status = 'approved', reviewed_at = now() where id = v_m;
  assert (select count(*) from push_outbox where kind = 'chore_accepted' and user_id = u(152)) = 1, 'child told it was accepted';

  -- Turning a kind off stops it.
  perform as_user(1); perform push_prefs_set('{"chore_waiting": false}');
  perform as_admin();
  insert into home_missions (child_id, parent_id, title, coins) values (u(152), u(1), 'Trash', 5) returning id into v_m;
  update home_missions set status = 'submitted', submitted_at = now() where id = v_m;
  assert (select count(*) from push_outbox where kind = 'chore_waiting') = 1, 'toggle off: nothing new for the parent';

  -- Sensei messages reach everyone who opted in and kept that on.
  perform as_user(2); perform push_prefs_set('{"sensei_message": false}');
  perform as_admin();
  insert into announcements (title, body, created_by) values ('Picture day', 'Wear a smile', u(4));
  assert (select count(*) from push_outbox where kind = 'sensei_message') = 2, 'parent and kid told, the one who opted out is not';

  -- Delivery hand-off: only the service takes messages, once, and dead devices are dropped.
  perform as_user(152);
  perform expect_error($q$select push_claim()$q$, 'permission denied');
  perform expect_error($q$select * from push_outbox$q$, 'permission denied');
  perform expect_error($q$select * from push_subscriptions$q$, 'permission denied');
  perform as_admin();
  c := push_claim();
  assert jsonb_array_length(c) >= 3, 'due messages claimed: ' || c::text;
  assert jsonb_array_length(push_claim()) = 0, 'a message is claimed once';
  assert exists (select 1 from jsonb_array_elements(c) x where x ->> 'kind' = 'chore_accepted' and jsonb_array_length(x -> 'subs') = 1), 'the kid message has the kid device';
  perform push_finish(array(select (x ->> 'id')::bigint from jsonb_array_elements(c) x), array[e_kid]);
  assert (select disabled_at is not null from push_subscriptions where endpoint = e_kid), 'dead device dropped';
  assert (select count(*) from push_outbox where sent_at is null and claimed_at is not null) = 0, 'all marked sent';

  -- Nobody can switch off someone else's device.
  perform as_user(2); perform push_unsubscribe(e_parent);
  perform as_admin();
  assert (select disabled_at is null from push_subscriptions where endpoint = e_parent), 'not your device';
  perform as_user(1); perform push_unsubscribe(e_parent);
  perform as_admin();
  assert (select disabled_at is not null from push_subscriptions where endpoint = e_parent), 'own device switched off';

  -- Timed messages: nothing crashes, and the same minute never queues twice.
  perform push_schedule(); perform push_schedule();
  select count(*) into v_n from push_outbox where kind in ('quiz_soon', 'weekly_summary');
  assert v_n <= 2, 'at most one of each timed message per person';
end $$;

delete from announcements where title = 'Picture day';
delete from home_missions where child_id in (u(152), u(153));
delete from parent_links where child_id in (u(152), u(153));
delete from push_outbox;
delete from push_subscriptions;
delete from push_prefs;
delete from auth.users where id in (u(152), u(153));
