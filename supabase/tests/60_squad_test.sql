-- Friends and squads.
\set ON_ERROR_STOP on

do $$
declare r jsonb; v_squad uuid; ids uuid;
begin
  -- 11 asks 12 by code
  perform as_user(11);
  perform friend_request('QKBBBBB2');
  perform expect_error($q$select friend_request('QKBBBBB2')$q$, 'already friends or waiting');
  perform expect_error($q$select friend_request('QKAAAAA2')$q$, 'your own code');
  perform expect_error($q$select friend_request('ZZZZZZZ9')$q$, 'no hero has that code');
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
  perform friend_request('QKBBBBB2');
  perform as_admin();
end $$;
