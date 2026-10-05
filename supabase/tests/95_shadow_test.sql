-- Shadow Signal: secret roles, clues, votes, guess, scoring.
\set ON_ERROR_STOP on

create function public.as_user_id(p uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', p::text, false);
  set role authenticated;
end $$;

do $$
declare
  v_code text; r jsonb; v_room uuid; g shadow_games; i int; k int; uid uuid; who int; sh int; v jsonb; ord jsonb;
begin
  perform as_user(11);
  perform room_leave();
  v_code := room_create('shadow-signal');
  perform as_user(13); perform room_join(v_code);
  perform as_user(11);
  perform expect_error($q$select room_start()$q$, 'at least 3');
  perform as_user(21); perform room_join(v_code);
  perform as_user(11);
  perform room_start();

  perform as_admin();
  select id into v_room from rooms where code = v_code;
  select * into g from shadow_games where room_id = v_room;
  assert jsonb_array_length(g.options) = 8 and g.options ? g.word, 'options include the word';
  ord := g.order_ids;

  -- the shadow does not see the word, everyone else does
  for i in 0..2 loop
    uid := (ord ->> i)::uuid;
    perform as_user_id(uid);
    r := shadow_view(v_code);
    if uid = g.shadow then
      assert (r->>'is_shadow')::boolean and r->'word' = 'null'::jsonb and r->>'category' = g.category, 'shadow sees category only';
    else
      assert not (r->>'is_shadow')::boolean and r->>'word' = g.word, 'crew sees the word';
    end if;
  end loop;

  -- clue phase: in turn, one clean word
  perform as_user_id((ord ->> 1)::uuid);
  perform expect_error($q$select shadow_clue('pizza')$q$, 'not your turn');
  perform as_user_id((ord ->> 0)::uuid);
  perform expect_error($q$select shadow_clue('two words')$q$, 'one word');
  perform expect_error($q$select shadow_clue('shit')$q$, 'different word');
  if (ord ->> 0)::uuid <> g.shadow then
    perform expect_error(format($q$select shadow_clue(%L)$q$, g.word), 'gives it away');
  end if;
  perform shadow_clue('tasty');
  perform as_user_id((ord ->> 1)::uuid); perform shadow_clue('round');
  perform as_user_id((ord ->> 2)::uuid); perform shadow_clue('yummy');
  r := shadow_view(v_code);
  assert r->>'phase' = 'vote', 'moves to voting';
  assert (r->'players'->0->>'clue') = 'tasty', 'clues are public';

  -- vote everyone for the shadow (who votes for self gets another target)
  select pos - 1 into sh from jsonb_array_elements_text(ord) with ordinality t(id, pos) where id::uuid = g.shadow;
  for i in 0..2 loop
    perform as_user_id((ord ->> i)::uuid);
    perform expect_error(format($q$select shadow_vote(%s)$q$, i), 'someone else');
    perform shadow_vote(case when i = sh then (sh + 1) % 3 else sh end);
  end loop;
  perform as_user_id(g.shadow);
  r := shadow_view(v_code);
  assert r->>'phase' = 'guess' and jsonb_array_length(r->'options') = 8, 'caught shadow gets to guess';
  perform as_user_id((select (ord ->> ((sh + 1) % 3))::uuid));
  assert shadow_view(v_code)->'options' = 'null'::jsonb, 'crew does not see the options';
  perform expect_error($q$select shadow_guess('lamp')$q$, 'not time to guess');
  perform as_user_id(g.shadow);
  perform shadow_guess(g.word);
  r := shadow_view(v_code);
  assert r->>'state' = 'done' and (r->'result'->>'shadow_won')::boolean, 'a right guess wins it for the shadow';
  assert r->'result'->>'word' = g.word, 'word revealed at the end';
  perform as_admin();
  assert (select score from room_players where room_id = v_room and child_id = g.shadow) = 3, 'shadow scores 3';
  assert (select score from room_players where room_id = v_room and child_id <> g.shadow limit 1) = 0, 'crew scores nothing';
end $$;

-- A shadow who escapes: votes split, nobody caught.
do $$
declare v_code text; r jsonb; v_room uuid; g shadow_games; ord jsonb; i int; sh int; others int[];
begin
  perform as_user(11);
  perform room_leave();
  v_code := room_create('shadow-signal');
  perform as_user(13); perform room_join(v_code);
  perform as_user(21); perform room_join(v_code);
  perform as_user(11); perform room_start();
  perform as_admin();
  select id into v_room from rooms where code = v_code;
  select * into g from shadow_games where room_id = v_room;
  ord := g.order_ids;
  select pos - 1 into sh from jsonb_array_elements_text(ord) with ordinality t(id, pos) where id::uuid = g.shadow;
  -- skip the clue round by timing out
  for i in 1..3 loop
    perform as_admin();
    update shadow_games set phase_started_at = now() - interval '1 hour' where room_id = v_room;
    perform as_user_id((ord ->> 0)::uuid);
    r := shadow_view(v_code);
  end loop;
  assert r->>'phase' = 'vote', 'timeouts skip the clues';
  for i in 0..2 loop
    perform as_user_id((ord ->> i)::uuid);
    -- each player votes for the next player round the table, so the shadow gets exactly one vote
    perform shadow_vote((i + 1) % 3);
  end loop;
  r := shadow_view(v_code);
  assert r->>'state' = 'done' and not (r->'result'->>'caught')::boolean and (r->'result'->>'shadow_won')::boolean, 'escaped';
  perform as_admin();
  assert (select score from room_players where room_id = v_room and child_id = g.shadow) = 3;
end $$;
