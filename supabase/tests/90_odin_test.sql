-- ODIN: dealing, hidden hands, legal moves, action cards, winning.
\set ON_ERROR_STOP on

do $$
declare
  v_code text; r jsonb; v_room uuid; v_cur int; i int; g odin_games; v_card text; v_hand jsonb; v_uid uuid; n int; k int;
begin
  assert (select jsonb_array_length(odin_new_deck())) = 4 * 25 + 8, 'deck size 108';
  select count(*) into n from jsonb_array_elements_text(odin_new_deck()) t(e) where t.e = 'R0';
  assert n = 1, 'one red zero, got ' || n;

  perform as_user(11);
  v_code := room_create('odin');
  perform as_user(13);
  perform room_join(v_code);
  perform as_user(11);
  perform room_start();
  perform as_admin();
  select id into v_room from rooms where code = v_code;
  select * into g from odin_games where room_id = v_room;
  assert (select count(*) from odin_hands where room_id = v_room) = 2, 'two hands';
  assert (select min(jsonb_array_length(hand)) from odin_hands where room_id = v_room) = 7, 'seven cards each';
  assert jsonb_array_length(g.deck) = 108 - 14 - 1, 'deck after deal';

  -- hands are secret: view shows own cards, only counts for others
  perform as_user(13);
  r := odin_view(v_code);
  assert jsonb_array_length(r->'hand') = 7, 'own hand visible';
  assert not (r::text like '%"hand"%' and (r->'players'->0) ? 'hand'), 'no other hands';
  perform expect_error($q$select odin_move('R5')$q$, 'not your turn');

  -- rig the game: player 11 to move, known hands
  perform as_admin();
  update odin_games set turn = 0, dir = 1, discard = '["R5"]', color = 'R', order_ids = jsonb_build_array(u(11), u(13)) where room_id = v_room;
  update odin_hands set hand = '["R7","R4","G1","W","W4"]' where room_id = v_room and child_id = u(11);
  update odin_hands set hand = '["Y1","Y2","R2","RD"]' where room_id = v_room and child_id = u(13);
  update odin_games set deck = '["G9","G8","G7","G6","G5","G4","G3"]' where room_id = v_room;

  perform as_user(11);
  perform expect_error($q$select odin_move('G1')$q$, 'does not match');
  perform expect_error($q$select odin_move('Y9')$q$, 'do not have');
  perform expect_error($q$select odin_move('W')$q$, 'pick a colour');
  perform odin_move('R7');                       -- red 7 on red 5
  r := odin_view(v_code);
  assert not (r->>'my_turn')::boolean, 'turn passed';
  perform as_user(13);
  r := odin_view(v_code);
  assert (r->>'my_turn')::boolean and r->>'top' = 'R7', 'now 13 to move';
  perform expect_error($q$select odin_move('Y1')$q$, 'does not match');
  perform odin_move('R2');                       -- red colour matches red 7
  perform as_user(11);
  perform odin_move('R4');
  perform as_user(13);
  perform odin_move('RD');                       -- draw two: 11 draws 2 and loses the turn (two players)
  perform as_admin();
  assert (select jsonb_array_length(hand) from odin_hands where room_id = v_room and child_id = u(11)) = 5, '11 drew two';
  select turn into k from odin_games where room_id = v_room;
  assert k = 1, 'two-player draw two gives the turn back to 13';
  perform as_user(13);
  perform odin_move(null);                       -- draw and pass
  perform as_user(11);
  perform odin_move('W4', 'G');                  -- wild four, colour green
  perform as_admin();
  assert (select color from odin_games where room_id = v_room) = 'G', 'chosen colour';
  assert (select jsonb_array_length(hand) from odin_hands where room_id = v_room and child_id = u(13)) = 7, '13 drew four';
  select turn into k from odin_games where room_id = v_room;
  assert k = 0, 'wild four skips 13 in a two-player game';
  -- winning: empty the hand
  update odin_games set turn = 0, discard = '["G1"]', color = 'G' where room_id = v_room;
  update odin_hands set hand = '["G4"]' where room_id = v_room and child_id = u(11);
  perform as_user(11);
  perform odin_move('G4');
  r := odin_view(v_code);
  assert r->>'state' = 'done' and r->>'winner' = 'Brave Comet', 'winner announced';
  perform expect_error($q$select odin_move('G1')$q$, 'not in a game');

  -- trivia functions ignore ODIN rooms and the rooms are reusable
  assert my_room() is null, 'room over';
  perform as_user(11);
  perform room_leave();
  v_code := room_create('trivia-clash');
  assert v_code is not null;
end $$;
