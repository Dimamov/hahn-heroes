-- Hero showcase: titles must be earned.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(101, 102) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(101), 'SWAAAAA2', 'Show A', 5, 'ana'), (u(102), 'SWBBBBB2', 'Show B', 5, 'ana');

do $$
declare r jsonb;
begin
  perform as_user(101);
  r := showcase_state();
  assert r->>'title' = 'rookie' and r->>'pose' = 'stand' and r->'unlocked' = '["rookie"]'::jsonb, 'fresh hero: ' || r::text;
  perform expect_error($q$select showcase_set('keeper', 'stand')$q$, 'not earned');
  perform expect_error($q$select showcase_set('rookie', 'dance')$q$, 'no such pose');
  perform expect_error($q$select showcase_set('nonsense', 'stand')$q$, 'not earned');
  perform showcase_set('rookie', 'cheer');
  assert showcase_state()->>'pose' = 'cheer', 'pose saved';

  -- earn Detective by solving a Mystery Lab case, and Story Keeper by finishing episode 1
  perform adv_answer('lab1', 'q1', 1); perform adv_answer('lab1', 'q2', 0); perform adv_answer('lab1', 'q3', 2);
  perform adv_complete('lab1');
  perform story_answer('ep1', 'cp1', 1); perform story_answer('ep1', 'cp2', 0); perform story_answer('ep1', 'cp3', 2);
  perform story_complete('ep1');
  r := showcase_state();
  assert r->'unlocked' @> '["detective","keeper"]'::jsonb and not (r->'unlocked' @> '["scholar"]'::jsonb), 'earned two titles: ' || r::text;
  perform showcase_set('detective', 'power');
  r := showcase_state();
  assert r->>'title' = 'detective' and r->>'pose' = 'power', 'title saved';

  -- collector: 20 different cards
  perform as_admin();
  insert into hero_cards (hero_id, card_id, qty) select u(101), id, 1 from card_defs where id not in (select card_id from hero_cards where hero_id = u(101)) limit 20
  on conflict do nothing;
  perform as_user(101);
  assert showcase_state()->'unlocked' @> '["collector"]'::jsonb, 'collector earned';

  perform as_user(102);
  assert showcase_state()->>'title' = 'rookie', 'other hero untouched';
end $$;
