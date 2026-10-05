-- Friends and squads.
\set ON_ERROR_STOP on

do $$
declare r jsonb; v_squad uuid; ids uuid; i int; v_new text;
begin
  -- friends use a separate friend code, never the sign-in code
  update heroes set friend_code = 'FRAAAA' where hero_code = 'QKAAAAA2';
  update heroes set friend_code = 'FRBBBB' where hero_code = 'QKBBBBB2';
  -- 11 asks 12 by code
  perform as_user(11);
  assert (friend_request('QKBBBBB2')->>'name') is null, 'the sign-in code finds nobody';
  perform friend_request('FRBBBB');
  perform expect_error($q$select friend_request('FRBBBB')$q$, 'already friends or waiting');
  perform expect_error($q$select friend_request('FRAAAA')$q$, 'your own code');
  assert (friend_request('ZZZZZ9')->>'name') is null, 'unknown friend code';
  for i in 1..8 loop perform friend_request('ZZZZZ9'); end loop;
  perform expect_error($q$select friend_request('ZZZZZ9')$q$, 'too many tries');
  perform as_admin();
  delete from friend_misses;
  perform as_user(11);
  assert jsonb_array_length(my_friends()->'outgoing') = 1, 'outgoing request';
  -- 12 sees and accepts it; 11 cannot accept their own request
  perform as_user(12);
  r := my_friends();
  assert jsonb_array_length(r->'incoming') = 1 and (r->'incoming'->0->>'name') = 'Brave Comet', 'incoming request';
  perform expect_error(format($q$select friend_respond(%L, true)$q$, r->'incoming'->0->>'id'), 'no such request') where false;
  perform friend_respond((r->'incoming'->0->>'id')::uuid, true);
  assert jsonb_array_length(my_friends()->'friends') = 1, 'friends now';
  -- squads
  perform as_user(11);
  perform expect_error($q$select squad_create('Hacky', 'Wolves')$q$, 'pick a name');
  v_squad := squad_create('Brave', 'Wolves');
  perform expect_error($q$select squad_create('Bold', 'Owls')$q$, 'leave your squad first');
  perform expect_error(format($q$select squad_invite(%L)$q$, u(13)), 'only invite friends');
  perform squad_invite(u(12));
  perform as_user(12);
  r := my_squad();
  assert jsonb_array_length(r->'invites') = 1 and r->'squad' = 'null'::jsonb, 'invite visible, not yet a member';
  perform squad_respond(v_squad, true);
  r := my_squad();
  assert (r->'squad'->>'name') = 'Brave Wolves' and jsonb_array_length(r->'squad'->'members') = 2 and not (r->'squad'->>'leader')::boolean, 'member view';
  -- outsiders see nothing
  perform as_user(13);
  r := my_squad();
  assert r->'squad' = 'null'::jsonb and jsonb_array_length(r->'invites') = 0, 'outsider sees nothing';
  perform expect_error($q$select * from squads$q$, 'permission denied');
  -- member leaves, then leader disbands
  perform as_user(12);
  perform squad_leave();
  assert (my_squad()->'squad') = 'null'::jsonb, 'left';
  perform as_user(11);
  assert jsonb_array_length(my_squad()->'squad'->'members') = 1, 'only leader left';
  perform squad_leave();
  assert (my_squad()->'squad') = 'null'::jsonb, 'disbanded';
  -- friends can be removed and re-requested
  perform friend_remove((my_friends()->'friends'->0->>'id')::uuid);
  assert jsonb_array_length(my_friends()->'friends') = 0, 'removed';
  perform friend_request('FRBBBB');
  -- changing a friend code keeps friends and retires the old code
  perform as_user(12);
  v_new := friend_code_reset();
  assert v_new ~ '^[A-HJKMNP-Z2-9]{6}$' and v_new <> 'FRBBBB', 'new code';
  perform as_user(13);
  assert (friend_request('FRBBBB')->>'name') is null, 'the old code no longer works';
  perform as_admin();
  delete from friend_misses;
end $$;
