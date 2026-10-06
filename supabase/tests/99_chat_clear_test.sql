-- Clearing old chat: Sensei only, only messages older than the cutoff, hidden from readers, unreviewed AI flags are kept.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(165, 166) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(165), 'CAAAAAA3', 'Clear A', 5, 'ana'), (u(166), 'CBBBBBB3', 'Clear B', 5, 'ana');

do $$
declare v_old bigint; v_flag bigint; v_new bigint; v_n int; r jsonb;
begin
  perform as_admin();
  insert into friendships (a, b, status) values (u(165), u(166), 'accepted');
  insert into friend_messages (sender, recipient, body, created_at) values (u(165), u(166), 'old hello', now() - interval '40 days') returning id into v_old;
  insert into friend_messages (sender, recipient, body, created_at) values (u(165), u(166), 'old flagged', now() - interval '45 days') returning id into v_flag;
  insert into friend_messages (sender, recipient, body) values (u(166), u(165), 'new hello') returning id into v_new;
  insert into chat_ai_checked (kind, message_id, flagged, reason) values ('friend', v_flag, true, 'test');

  perform as_user(165);
  perform expect_error($q$select sensei_chat_clear_old(30)$q$, 'only the Sensei');
  perform expect_error($q$select sensei_chat_old_count(30)$q$, 'only the Sensei');

  perform as_user(4);
  assert sensei_chat_old_count(30) = 1, 'one clearable old message (flagged one is kept)';
  perform expect_error($q$select sensei_chat_clear_old(3)$q$, 'at least the last 7 days');
  v_n := sensei_chat_clear_old(30);
  assert v_n = 1, 'one message cleared';
  assert sensei_chat_old_count(30) = 0, 'nothing left to clear';
  perform as_admin();
  assert (select cleared_at is not null from friend_messages where id = v_old), 'old message is marked, not erased';
  assert (select cleared_at is null from friend_messages where id = v_flag), 'unreviewed flagged message stays';
  assert (select cleared_at is null from friend_messages where id = v_new), 'new message stays';

  perform as_user(165);
  r := friend_chat_read(u(166));
  assert r::text not like '%old hello%' and r::text like '%new hello%', 'cleared message is hidden from kids';
  perform as_user(4);
  assert sensei_chat_log(u(165))::text not like '%old hello%', 'cleared message is hidden from the log';
end $$;
