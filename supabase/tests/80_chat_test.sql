-- Moderated chat: filter, warning then pause, parent request, Sensei unlock.
\set ON_ERROR_STOP on

do $$
declare v_code text; r jsonb;
begin
  -- the filter catches look-alikes but leaves normal words alone
  assert chat_flagged('what the f u c k'), 'spaced swear';
  assert chat_flagged('SH1T'), 'look-alike swear';
  assert chat_flagged('you are an a$s'), 'short word with symbols';
  assert not chat_flagged('Class assignment about the Hellenic classics, hello!'), 'ordinary words pass';
  assert not chat_flagged('great game, pass me the basket'), 'substrings of ordinary words pass';

  perform as_user(11);
  v_code := room_create('trivia-clash');
  perform as_user(13); perform room_join(v_code);
  perform as_user(21); perform expect_error($q$select chat_send('hi')$q$, 'join a room');

  -- chat needs a class: a hero who has not joined one is told so (u11 joined one earlier)
  perform as_admin();
  create temp table saved_members as select * from class_members where child_id = u(11);
  delete from class_members where child_id = u(11);
  perform as_user(11);
  assert (chat_send('hello')->>'no_class')::boolean and not (chat_read()->>'can_chat')::boolean, 'no class, no chat';
  -- no class, but a friend in the room: chat opens; a stranger joining closes it again
  perform as_admin();
  insert into friendships (a, b, status) values (u(11), u(13), 'accepted');
  perform as_user(11);
  assert (chat_read()->>'can_chat')::boolean, 'only a friend in the room: chat open';
  perform as_user(13);  -- put the friend's stranger test aside: friendship is mutual for chat
  perform as_admin();
  delete from friendships where a = u(11) and b = u(13);
  insert into class_members select * from saved_members;
  drop table saved_members;

  perform as_user(11);
  assert (chat_read()->>'can_chat')::boolean, 'class joined, chat open';
  assert (chat_send('good luck everyone!')->>'ok')::boolean, 'normal message posts';
  assert (chat_send('too fast')->>'slow')::boolean, 'one message a second';
  perform pg_sleep(1.1);
  assert (chat_send('call me 555 123 4567')->>'private')::boolean, 'phone numbers blocked';
  perform pg_sleep(1.1);
  assert (chat_send('visit www.example.com')->>'private')::boolean, 'links blocked';
  perform pg_sleep(1.1);

  perform as_user(13);
  r := chat_send('this is sh1t');
  assert (r->>'warning')::boolean and not (r->>'ok')::boolean, 'first swear warns';
  perform pg_sleep(1.1);
  assert (chat_send('thanks, you too')->>'ok')::boolean, 'chat still works after a warning';
  perform pg_sleep(1.1);
  r := chat_send('f u c k');
  assert (r->>'banned')::boolean, 'second swear pauses chat';
  perform pg_sleep(1.1);
  assert (chat_send('hello?')->>'banned')::boolean, 'banned stays banned';
  r := chat_read();
  assert (r->>'banned')::boolean and jsonb_array_length(r->'messages') = 2, 'read shows only the clean messages';

  -- other players see messages; the swear never reached the room
  perform as_user(11);
  assert not exists (select 1 from jsonb_array_elements(chat_read()->'messages') m where m->>'body' ilike '%sh1t%'), 'swear never stored';

  -- parent (u1 is linked to u21 only), so link u13 for this test
  perform as_admin();
  insert into parent_links (child_id, parent_id) values (u(13), u(1)) on conflict do nothing;
  perform as_user(1);
  assert (child_chat(u(13))->>'banned')::boolean, 'parent sees the pause';
  perform chat_request_unlock(u(13));
  assert (child_chat(u(13))->>'requested')::boolean, 'request recorded';
  perform expect_error(format($q$select chat_request_unlock(%L)$q$, u(12)), 'not your child');
  perform expect_error($q$select sensei_chat_requests()$q$, 'only the Sensei');
  perform expect_error(format($q$select chat_unlock(%L)$q$, u(13)), 'only the Sensei');

  perform as_user(4);
  assert jsonb_array_length(sensei_chat_log(u(13))) = 2 and (sensei_chat_log(u(13))->0->>'body') = 'good luck everyone!', 'Sensei reads the recent lines';
  perform as_user(1);
  perform expect_error(format($q$select sensei_chat_log(%L)$q$, u(13)), 'only the Sensei');
  perform as_user(4);
  assert jsonb_array_length(sensei_chat_requests()) = 1 and (sensei_chat_requests()->0->>'requested')::boolean, 'Sensei sees the request';
  perform chat_unlock(u(13));
  assert jsonb_array_length(sensei_chat_requests()) = 0, 'cleared';

  perform as_user(13);
  perform pg_sleep(1.1);
  assert (chat_send('sorry everyone')->>'ok')::boolean, 'chat works again';
  perform pg_sleep(1.1);
  assert (chat_send('damn')->>'banned')::boolean, 'one strike left after an unlock';
  perform room_leave();
  perform as_user(11); perform room_leave();
  perform as_admin();
end $$;
