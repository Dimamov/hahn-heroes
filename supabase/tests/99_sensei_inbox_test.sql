-- Sensei inbox: messages, bug reports, ideas and diamond rewards.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(190, 191) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(190), 'CBCDFGH4', 'Bug Finder', 5, 'ana'), (u(191), 'CHGFDCB4', 'Other Kid', 6, 'ana');

do $$
declare i int; v_id bigint; r jsonb; bal int;
begin
  perform as_user(190);
  perform sensei_message_send('bug', 'The shop button does nothing on my Chromebook');
  perform sensei_message_send('idea', 'A game about volcanoes');
  perform expect_error($q$select sensei_message_send('spam', 'hi')$q$, 'bad kind');
  perform expect_error($q$select sensei_message_send('message', '   ')$q$, 'write 1 to 500');
  assert jsonb_array_length(sensei_my_messages()) = 2, 'hero sees own messages';
  for i in 1..8 loop perform sensei_message_send('message', 'hello ' || i); end loop;
  perform expect_error($q$select sensei_message_send('message', 'one more')$q$, 'too many messages');

  perform as_user(191);
  assert jsonb_array_length(sensei_my_messages()) = 0, 'other hero sees none';
  perform expect_error($q$select sensei_inbox()$q$, 'only the Sensei');
  perform expect_error($q$select sensei_message_resolve(1, 10, null)$q$, 'only the Sensei');

  perform as_user(4);
  assert jsonb_array_length(sensei_inbox()) = 10, 'sensei sees inbox';
  assert (sensei_inbox()->0->>'hero') = 'Bug Finder', 'inbox names the hero';
  perform expect_error($q$select sensei_message_resolve(1, 501, null)$q$, 'reward must be');

  perform as_admin();
  select id into v_id from sensei_messages where kind = 'bug' and hero_id = u(190);
  perform as_user(4);
  r := sensei_message_resolve(v_id, 25, 'Great catch, hero!');
  assert (r->>'awarded')::int = 25, 'reward granted';
  r := sensei_message_resolve(v_id, 50, 'Fixed it!');
  assert (r->>'awarded')::int = 50, 'a second reward is a separate grant';

  perform as_user(190);
  assert (select (m->>'reward')::int from jsonb_array_elements(sensei_my_messages()) m where (m->>'id')::bigint = v_id) = 75, 'hero sees the total';
  assert (select m->>'status' from jsonb_array_elements(sensei_my_messages()) m where (m->>'id')::bigint = v_id) = 'rewarded', 'status rewarded';
  assert (select m->>'reply' from jsonb_array_elements(sensei_my_messages()) m where (m->>'id')::bigint = v_id) = 'Fixed it!', 'reply shows';
  assert (select (m->>'unseen')::boolean from jsonb_array_elements(sensei_my_messages()) m where (m->>'id')::bigint = v_id), 'reply is unseen';
  perform sensei_replies_seen();
  assert not (select (m->>'unseen')::boolean from jsonb_array_elements(sensei_my_messages()) m where (m->>'id')::bigint = v_id), 'seen after the takeover';
  perform as_admin();
  assert (select coalesce(sum(amount), 0) from ledger_entries where child_id = u(190) and source = 'sensei') = 75, 'diamonds landed';
end $$;
