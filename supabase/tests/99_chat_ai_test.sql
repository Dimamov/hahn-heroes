-- AI second look at chat: Sensei only, text and keys only out, flags come back, nothing is blocked or removed.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(163, 164) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(163), 'CAAAAAA2', 'Chat AI A', 5, 'ana'), (u(164), 'CBBBBBB2', 'Chat AI B', 5, 'ana');

do $$
declare r jsonb; v_room uuid; v_msg bigint; v_fr bigint; k text;
begin
  perform as_admin();
  insert into friendships (a, b, status) values (u(163), u(164), 'accepted');
  insert into friend_messages (sender, recipient, body) values (u(163), u(164), 'what is your address') returning id into v_fr;
  insert into chat_ai_checked (kind, message_id, flagged) select 'room', id, false from chat_messages;  -- ignore older messages
  v_room := (select id from rooms limit 1);
  if v_room is not null then
    insert into chat_messages (room_id, child_id, body) values (v_room, u(164), 'good game') returning id into v_msg;
  end if;

  perform as_user(163);
  perform expect_error($q$select sensei_chat_ai_batch()$q$, 'only the Sensei');
  perform expect_error($q$select sensei_chat_ai_flags()$q$, 'only the Sensei');
  perform expect_error($q$select * from chat_ai_checked$q$, 'permission denied');

  perform as_user(4);
  r := sensei_chat_ai_batch();
  assert r::text like '%what is your address%', 'friend message is in the batch';
  assert r::text not like '%Chat AI%' and r::text not like '%' || u(163)::text || '%', 'no names or ids go out';
  perform sensei_chat_ai_save(jsonb_build_array(jsonb_build_object('key', 'f:' || v_fr, 'flagged', true, 'reason', 'Asks for an address'),
                                                jsonb_build_object('key', 'bad key', 'flagged', true)));
  assert not (sensei_chat_ai_batch()::text like '%what is your address%'), 'checked messages are not sent again';
  r := sensei_chat_ai_flags();
  assert jsonb_array_length(r) = 1 and r->0->>'reason' = 'Asks for an address' and r->0->>'name' = 'Chat AI A', 'flag shows for the Sensei';
  k := r->0->>'key';
  perform sensei_chat_ai_dismiss(k);
  assert jsonb_array_length(sensei_chat_ai_flags()) = 0, 'reviewed flags clear';
  perform expect_error($q$select sensei_chat_ai_dismiss('nope')$q$, 'not a message');

  perform as_admin();
  assert exists (select 1 from friend_messages where id = v_fr), 'the message itself is untouched';
  delete from chat_ai_checked;
  delete from friend_messages where id = v_fr;
  delete from friendships where a = u(163);
end $$;
select as_admin();
delete from auth.users where id in (u(163), u(164));
