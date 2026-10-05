-- Escape the Nexus: own seals, shared clock, penalties, boosts, win and loss.
\set ON_ERROR_STOP on

insert into public.questions (id, subject, grade, skill, difficulty, prompt, choices)
select 'nx5-' || n, 'math', 5, 'fractions', 1, 'Nexus question ' || n, '["a","b","c","d"]'::jsonb from generate_series(1, 60) n;
insert into public.question_keys (question_id, answer, explanation) select 'nx5-' || n, 0, 'Because ' || n from generate_series(1, 60) n;
-- the older test questions would get in the way: only the Nexus ones are active now
update public.questions set active = false where id not like 'nx5-%';

do $$
declare
  v_code text; r jsonb; v_room uuid; g nexus_games; ord jsonb; a uuid; b uuid; c uuid; s nexus_seals; i int; res jsonb; total0 int;
begin
  perform as_user(11); perform room_leave();
  v_code := room_create('escape-nexus');
  perform as_user(13); perform room_join(v_code);
  perform as_user(21); perform room_join(v_code);
  perform as_user(11); perform room_start();

  perform as_admin();
  select id into v_room from rooms where code = v_code;
  select * into g from nexus_games where room_id = v_room;
  ord := g.order_ids;
  a := (ord ->> 0)::uuid; b := (ord ->> 1)::uuid; c := (ord ->> 2)::uuid;
  assert g.base_seconds = 60 + 3 * 50, 'clock scales with the squad';
  assert (select count(*) from nexus_seals where room_id = v_room) = 3;
  assert (select min(jsonb_array_length(qids)) from nexus_seals where room_id = v_room) = 6, 'three seals and three spares';
  assert (select count(*) from question_history where child_id = a and question_id like 'nx5-%') = 6, 'served and marked seen';

  -- everyone sees only their own question and nobody sees the key
  perform as_user_id(a);
  r := nexus_view(v_code);
  assert r->'question'->>'prompt' like 'Nexus question %' and r->'question' ? 'hidden', 'own question';
  assert not (r->'question')::text like '%answer%', 'no key in the view';
  assert (r->>'solved')::int = 0 and (r->>'need')::int = 3;
  assert jsonb_array_length(r->'players') = 3;
  total0 := (r->>'seconds_total')::int;

  -- a right answer opens a lock; a wrong one costs the squad time
  res := nexus_answer(0);
  assert (res->>'correct')::boolean;
  res := nexus_answer(1);
  assert not (res->>'correct')::boolean and (res->>'penalty')::int = 10, 'wrong costs 10 seconds';
  r := nexus_view(v_code);
  assert (r->>'seconds_total')::int = total0 + 10 and (r->>'solved')::int = 1 and (r->>'wrong')::int = 1;
  res := nexus_answer(0); res := nexus_answer(0);
  r := nexus_view(v_code);
  assert (r->>'solved')::int = 3 and r->'question' = 'null'::jsonb, 'seal open';
  assert (r->>'can_boost')::boolean, 'a finished hero can boost';
  perform expect_error($q$select nexus_answer(0)$q$, 'already open');

  -- boosting a teammate hides one wrong choice, once
  perform expect_error($q$select nexus_boost(0)$q$, 'pick a teammate');
  perform nexus_boost(1);
  perform expect_error($q$select nexus_boost(2)$q$, 'already boosted');
  perform as_user_id(b);
  r := nexus_view(v_code);
  assert jsonb_array_length(r->'question'->'hidden') = 1 and (r->'question'->'hidden'->>0)::int <> 0, 'a wrong choice is hidden';
  perform expect_error($q$select nexus_boost(0)$q$, 'open your own seal');

  -- the others finish: the squad escapes
  for i in 1..3 loop res := nexus_answer(0); end loop;
  perform as_user_id(c);
  for i in 1..3 loop res := nexus_answer(0); end loop;
  r := nexus_view(v_code);
  assert r->>'outcome' = 'won' and r->>'state' = 'done', 'squad escaped';
  perform expect_error($q$select nexus_answer(0)$q$, 'not in a game');
end $$;

-- Running out of time loses; running out of questions auto-opens the seal with a penalty.
do $$
declare v_code text; r jsonb; v_room uuid; i int; res jsonb;
begin
  perform as_user(11); perform room_leave();
  v_code := room_create('escape-nexus');
  perform as_user(13); perform room_join(v_code);
  perform as_user(11); perform room_start();
  perform as_admin();
  select id into v_room from rooms where code = v_code;
  perform as_user(11);
  for i in 1..6 loop res := nexus_answer(1); end loop;
  r := nexus_view(v_code);
  assert (r->>'solved')::int = 3, 'an exhausted seal opens';
  assert (r->>'penalty')::int = 6 * 10 + 3 * 30, 'with a penalty for every wrong answer and every missing lock';
  perform as_admin();
  update nexus_games set started_at = now() - interval '1 day' where room_id = v_room;
  perform as_user(13);
  r := nexus_view(v_code);
  assert r->>'outcome' = 'lost' and r->>'state' = 'done', 'out of time';
end $$;

select as_admin();
delete from public.question_history where question_id like 'nx5-%';
delete from public.questions where id like 'nx5-%';
update public.questions set active = true;
