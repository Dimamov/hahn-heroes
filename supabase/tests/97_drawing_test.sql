-- Squad Drawing: turns, strokes, guesses, scoring, reports.
\set ON_ERROR_STOP on

do $$
declare
  v_code text; r jsonb; v_room uuid; g drawing_games; ord jsonb; art uuid; gu uuid; other uuid; k int;
begin
  perform as_user(11); perform room_leave();
  v_code := room_create('squad-drawing');
  perform as_user(13); perform room_join(v_code);
  perform as_user(21); perform room_join(v_code);
  perform as_user(11);
  perform room_start();

  perform as_admin();
  select id into v_room from rooms where code = v_code;
  select * into g from drawing_games where room_id = v_room;
  ord := g.order_ids;
  art := (ord ->> 0)::uuid; gu := (ord ->> 1)::uuid; other := (ord ->> 2)::uuid;

  -- guessers never see the word; they see a pattern of blanks
  perform as_user_id(gu);
  r := drawing_view(v_code);
  assert r->>'word' is null and r->>'pattern' ~ '^[_ ]+$', 'guesser sees blanks only';
  assert not (r->>'is_artist')::boolean;
  perform expect_error($q$select drawing_stroke(1, '#ff0000', 4, '[[1,2]]')$q$, 'not drawing');
  perform expect_error($q$select drawing_clear()$q$, 'not drawing');

  -- the artist sees the word and draws
  perform as_user_id(art);
  r := drawing_view(v_code);
  assert r->>'word' = g.word and (r->>'is_artist')::boolean, 'artist sees the word';
  perform expect_error($q$select drawing_stroke(1, 'red', 4, '[[1,2]]')$q$, 'bad pen');
  perform expect_error($q$select drawing_stroke(1, '#ff0000', 4, '[[1,2000]]')$q$, 'bad stroke');
  perform expect_error($q$select drawing_stroke(1, '#ff0000', 4, '[]')$q$, 'bad stroke');
  perform drawing_stroke(1, '#ff0000', 4, '[[10,10],[20,20]]');
  perform drawing_stroke(1, '#ff0000', 4, '[[30,30]]');   -- same stroke continues
  perform drawing_stroke(2, '#0000ff', 8, '[[100,100],[200,200]]');
  perform expect_error($q$select drawing_guess('cat')$q$, 'you are drawing');

  perform as_user_id(gu);
  r := drawing_view(v_code, 0);
  assert jsonb_array_length(r->'strokes') = 2 and jsonb_array_length(r->'strokes'->0->'p') = 3, 'strokes arrive, joined';
  r := drawing_view(v_code, 1);
  assert (r->>'strokes_from')::int = 1 and jsonb_array_length(r->'strokes') = 1, 'incremental fetch';

  -- guesses: filtered, wrong ones are shared, right ones hide the text
  perform expect_error($q$select drawing_guess('sh1t')$q$, 'letters only');
  perform expect_error($q$select drawing_guess('shit')$q$, 'different word');
  r := drawing_guess('zzzz');
  assert not (r->>'correct')::boolean;
  perform pg_sleep(1.1);
  r := drawing_guess(g.word);
  assert (r->>'correct')::boolean and (r->>'points')::int >= 100, 'right guess scores';
  perform expect_error($q$select drawing_guess('again')$q$, 'already got it');
  r := drawing_view(v_code);
  assert r->>'word' = g.word, 'solver now sees the word';
  assert r->'guesses'->0->>'text' = 'zzzz' and r->'guesses'->1->'text' = 'null'::jsonb, 'right guesses are hidden';

  -- the other guesser solves it too: the round ends and the artist is paid
  perform as_user_id(other);
  perform drawing_guess(g.word);
  perform as_admin();
  select * into g from drawing_games where room_id = v_room;
  assert g.phase = 'reveal', 'everyone solved so the round ends';
  assert (select score from room_players where room_id = v_room and child_id = art) = 100, 'artist gets 50 per solver';

  -- reveal ends, next artist
  update drawing_games set phase_started_at = now() - interval '1 hour' where room_id = v_room;
  perform as_user_id(gu);
  r := drawing_view(v_code);
  assert (r->>'round')::int = 1 and r->>'phase' = 'draw' and (r->>'is_artist')::boolean, 'second artist';
  assert jsonb_array_length(r->'strokes') = 0, 'fresh page';

  -- two reports void a drawing
  perform as_user_id(art);
  perform drawing_report();
  r := drawing_view(v_code);
  assert not (r->>'voided')::boolean, 'one report is not enough with two guessers';
  perform as_user_id(other);
  perform drawing_report();
  perform as_admin();
  select * into g from drawing_games where room_id = v_room;
  assert g.phase = 'reveal' and g.voided, 'two reports end the round';
  assert (select count(*) from drawing_reports where room_id = v_room) = 2;
  perform as_user(4);
  assert jsonb_array_length(sensei_drawing_reports()) = 2, 'sensei sees reports';
  perform as_user_id(art);
  perform expect_error($q$select sensei_drawing_reports()$q$, 'only the Sensei');

  -- finish all rounds
  perform as_admin();
  for k in 1..3 loop
    update drawing_games set phase_started_at = now() - interval '1 hour' where room_id = v_room;
    perform as_user_id(gu); perform drawing_view(v_code);
    perform as_admin();
  end loop;
  assert (select state from rooms where id = v_room) = 'done', 'game ends after everyone drew';
end $$;
