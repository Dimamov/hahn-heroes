-- Hide and Seek: hiders stay hidden from the seeker, searches are limited, everyone gets a turn as seeker.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(160, 162) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(160), 'HSAAAAA2', 'Hide A', 5, 'ana'), (u(161), 'HSBBBBB2', 'Hide B', 5, 'ana'), (u(162), 'HSCCCCC2', 'Hide C', 5, 'ana');

do $$
declare
  v_code text; r jsonb; v_room uuid; i int; n int; seeker int; hider int; other int; v_spot int; s int;
begin
  perform as_user(160);
  v_code := room_create('hide-seek');
  perform as_user(161); perform room_join(v_code);
  perform as_user(162); perform room_join(v_code);
  perform as_user(160); perform room_start();
  perform as_admin();
  select id into v_room from rooms where code = v_code;
  assert (select count(*) from hide_games where room_id = v_room) = 1, 'game dealt';

  -- round 1: find who seeks
  for n in 160..162 loop
    perform as_user(n);
    r := hide_view(v_code);
    if (r->>'seeker')::boolean then seeker := n; end if;
  end loop;
  assert seeker is not null, 'one seeker';
  assert jsonb_array_length(r->'layout') = 24 and r->>'phase' = 'hide', 'hall dealt, hiding first';

  perform as_user(seeker);
  perform expect_error($q$select hide_move(3)$q$, 'you are the seeker');
  perform expect_error($q$select hide_search(3)$q$, 'not your search');

  -- hiders pick spots 5 and 5 (same spot) or different; both hide at spot 7 and 9
  hider := null;
  for n in 160..162 loop
    if n <> seeker then
      perform as_user(n);
      if hider is null then perform hide_move(7); hider := n; else perform hide_move(9); other := n; end if;
    end if;
  end loop;
  perform expect_error($q$select hide_move(99)$q$, 'pick a spot');

  perform as_user(seeker);
  r := hide_view(v_code);
  assert r->>'phase' = 'seek', 'all hidden, seeking starts';
  assert r->'my_spot' = 'null'::jsonb and r->'hiders' = 'null'::jsonb, 'seeker cannot see hiders';
  assert (r->>'searches_left')::int = 6, 'six searches';

  perform as_user(hider);
  r := hide_view(v_code);
  assert (r->>'my_spot')::int = 7 and (r->>'can_sneak')::boolean, 'hider sees own spot and may sneak';
  perform expect_error($q$select hide_move(7)$q$, 'different spot');
  perform hide_move(8);
  perform expect_error($q$select hide_move(10)$q$, 'already sneaked');

  perform as_user(seeker);
  assert (hide_search(7)->>'found')::int = 0, 'hider sneaked away';
  perform expect_error($q$select hide_search(7)$q$, 'already checked');
  assert (hide_search(9)->>'found')::int = 1, 'found the other hider';
  r := hide_view(v_code);
  assert jsonb_array_length(r->'found') = 1 and (r->>'searches_left')::int = 4, 'finding recorded';
  assert (hide_search(8)->>'found')::int = 1, 'found the sneaker';
  r := hide_view(v_code);
  assert r->>'phase' = 'reveal' and jsonb_array_length(r->'hiders') = 2, 'all found, reveal shows everyone';
  perform as_admin();
  assert (select score from room_players where room_id = v_room and child_id = u(seeker)) = 6, 'seeker: 2 per find plus 2 for all';

  -- jump ahead: force the rest of the rounds
  perform as_admin();
  for i in 1..2 loop
    update hide_games set phase_started_at = now() - interval '1 minute' where room_id = v_room;
    perform hide_tick(v_room);                                  -- reveal -> next hide
    update hide_games set phase_started_at = now() - interval '1 minute' where room_id = v_room;
    perform hide_tick(v_room);                                  -- hide -> seek (random spots)
    update hide_games set phase_started_at = now() - interval '1 minute' where room_id = v_room;
    perform hide_tick(v_room);                                  -- seek -> reveal (time up)
  end loop;
  update hide_games set phase_started_at = now() - interval '1 minute' where room_id = v_room;
  perform hide_tick(v_room);
  assert (select phase from hide_games where room_id = v_room) = 'done' and (select state from rooms where id = v_room) = 'done', 'three rounds, then done';

  delete from hide_games; delete from room_players where room_id = v_room; delete from rooms where id = v_room;
end $$;

delete from auth.users where id in (u(160), u(161), u(162));
