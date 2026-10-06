-- Vocabulary duel: a knockout bracket. Pairs answer the same questions, the better score wins, winners advance,
-- people who are out can only watch, and prizes follow how far each one got.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(184, 187) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(184), 'CVVVVVV4', 'Duel A', 5, 'ana'), (u(185), 'CWWWWWW4', 'Duel B', 5, 'ana'),
  (u(186), 'CXXXXXX4', 'Duel C', 5, 'ana'), (u(187), 'CYYYYYY4', 'Duel D', 5, 'ana');
insert into public.questions (id, subject, grade, skill, difficulty, prompt, choices)
select 'cd5-' || n, 'vocab', 5, 'words', 1, 'Duel word ' || n, '["a","b","c"]'::jsonb from generate_series(1, 10) n;
insert into public.question_keys (question_id, answer, explanation) select 'cd5-' || n, 1, 'because b' from generate_series(1, 10) n;

do $$
declare c uuid; code text; r jsonb; sid uuid; mm class_duel_matches; k int; i int; round_n int; champ uuid; loser1 uuid; loser2 uuid;
begin
  perform as_user(3);
  c := (create_class('Duel Room', 5)->>'id')::uuid;
  perform as_admin();
  insert into class_members (class_id, child_id) values (c, u(184)), (c, u(185)), (c, u(186)), (c, u(187));
  update questions set active = false where id not like 'cd5-%';

  perform as_user(3);
  perform expect_error(format($q$select class_live_create(%L, 'duel', 'vocab', 3, gen_random_uuid())$q$, c), 'word questions');
  code := class_live_create(c, 'duel', 'vocab', 3);
  perform as_user(184); perform class_live_join(code);
  perform as_user(3);
  perform expect_error(format($q$select class_live_start(%L)$q$, code), 'at least two');
  perform as_user(185); perform class_live_join(code);
  perform as_user(186); perform class_live_join(code);
  perform as_user(187); perform class_live_join(code);
  perform as_user(3);
  perform class_live_start(code);
  r := class_live_state(code);
  assert (r->'duel'->>'rounds')::int = 2 and (r->'duel'->>'round')::int = 1 and jsonb_array_length(r->'duel'->'matches') = 2, 'four players, two rounds, two first matches';
  perform as_user(184);
  assert class_live_state(code)->'duel'->>'my_status' = 'dueling', 'in a match';
  perform as_admin();
  select id into sid from class_sessions where class_id = c and kind = 'duel' and state = 'playing';

  -- round 1: the first player of each pair answers right, the second wrong
  for i in 1..3 loop
    perform as_admin();
    for mm in select * from class_duel_matches where session_id = sid and round = 1 loop
      select n into k from generate_series(184, 187) n where u(n) = mm.a;
      perform as_user(k); perform class_live_answer(1);
      select n into k from generate_series(184, 187) n where u(n) = mm.b;
      perform as_user(k); perform class_live_answer(0);
    end loop;
    perform as_user(3);
    r := class_live_state(code);
    assert r->>'phase' = 'reveal', 'everyone in a match answered, so the question ends by itself';
    perform class_live_skip(code);
  end loop;

  r := class_live_state(code);
  assert (r->'duel'->>'round')::int = 2 and jsonb_array_length(r->'duel'->'matches') = 3 and r->>'state' = 'playing', 'the final is set up';
  perform as_admin();
  select a into champ from class_duel_matches where session_id = sid and round = 2;
  select b into loser2 from class_duel_matches where session_id = sid and round = 2;
  select b into loser1 from class_duel_matches where session_id = sid and round = 1 limit 1;
  assert (select count(*) from class_duel_matches where session_id = sid and round = 1 and winner = a) = 2, 'first of each pair won';

  -- someone who is out can only watch
  select n into k from generate_series(184, 187) n where u(n) = loser1;
  perform as_user(k);
  assert class_live_state(code)->'duel'->>'my_status' = 'out', 'knocked out';
  assert (class_live_answer(1)->>'watching')::boolean, 'cannot answer, only watch';

  -- the final
  for i in 1..3 loop
    perform as_admin();
    select n into k from generate_series(184, 187) n where u(n) = champ;
    perform as_user(k); perform class_live_answer(1);
    perform as_admin();
    select n into k from generate_series(184, 187) n where u(n) = loser2;
    perform as_user(k); perform class_live_answer(0);
    perform as_user(3);
    perform class_live_skip(code);
  end loop;
  r := class_live_state(code);
  assert r->>'state' = 'done', 'one left standing';

  perform as_admin();
  select n into k from generate_series(184, 187) n where u(n) = champ;
  perform as_user(k);
  r := class_live_state(code);
  assert r->'duel'->>'my_status' = 'champion' and (r->>'my_reward')::int = 25, 'champion: 5 for dueling, 5 per win (two), 10 for the title';
  perform as_admin();
  select n into k from generate_series(184, 187) n where u(n) = loser2;
  perform as_user(k);
  assert (class_live_state(code)->>'my_reward')::int = 10, 'runner-up won one match';
  perform as_admin();
  select n into k from generate_series(184, 187) n where u(n) = loser1;
  perform as_user(k);
  assert (class_live_state(code)->>'my_reward')::int = 5, 'knocked out in round one still gets the taking-part prize';
end $$;
