-- Monthly usage report: counts per screen, no names, Sensei only; games can be hidden and shown again.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(154, 156) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(154), 'USAAAAA2', 'Use A', 5, 'ana'), (u(155), 'USBBBBB2', 'Use B', 5, 'ana'), (u(156), 'USCCCCC2', 'Use C', 6, 'ana');

do $$
declare r jsonb; g jsonb;
begin
  perform as_admin();
  delete from screen_use;
  perform as_user(154); perform ping('game:whack-shadow'); perform ping('learn');
  perform as_user(155); perform ping('game:whack-shadow');
  perform as_user(156); perform ping('learn'); perform ping('quiz:12345678-aaaa-bbbb');
  perform as_admin();
  -- B comes back on another day.
  insert into screen_use (day, child, screen, opens, pings) values (school_date() - 0, u(155), 'game:blocks', 1, 2) on conflict do nothing;

  perform as_user(4);
  r := sensei_usage_report(0);
  assert (r ->> 'active_kids')::int = 3, 'three kids active: ' || r::text;
  g := (select x from jsonb_array_elements(r -> 'screens') x where x ->> 'screen' = 'game:whack-shadow');
  assert (g ->> 'opens')::int = 2 and (g ->> 'players')::int = 2, 'whack: ' || g::text;
  assert exists (select 1 from jsonb_array_elements(r -> 'screens') x where x ->> 'screen' = 'quiz'), 'quiz ids are grouped';
  assert r::text not ilike '%Use A%', 'no names';
  assert jsonb_array_length(r -> 'hours') = 24, 'hours';
  r := sensei_usage_report(1);
  assert (r ->> 'active_kids')::int = 0, 'last month is empty';

  -- Hide and show again.
  perform sensei_hide_game('word-rush', true); perform sensei_hide_game('word-rush', true); perform sensei_hide_game('odin', true);
  assert hidden_games() = '["word-rush", "odin"]'::jsonb or hidden_games() = '["odin", "word-rush"]'::jsonb, 'hidden: ' || hidden_games()::text;
  perform sensei_hide_game('word-rush', false);
  assert hidden_games() = '["odin"]'::jsonb, 'shown again: ' || hidden_games()::text;
  perform sensei_hide_game('odin', false);
  assert hidden_games() = '[]'::jsonb;
  perform expect_error($q$select sensei_hide_game('Bad Id!', true)$q$, 'not a game');

  -- Only the Sensei.
  perform as_user(1);
  perform expect_error($q$select sensei_usage_report(0)$q$, 'only the Sensei');
  perform expect_error($q$select sensei_hide_game('odin', true)$q$, 'only the Sensei');
  perform as_user(154);
  perform expect_error($q$select sensei_usage_report(0)$q$, 'only the Sensei');
  perform expect_error($q$select * from screen_use$q$, 'permission denied');
  assert hidden_games() = '[]'::jsonb, 'kids can read which games are hidden';
end $$;

select as_admin();
delete from screen_use;
delete from traffic_pings where user_id in (u(154), u(155), u(156));
delete from presence where user_id in (u(154), u(155), u(156));
delete from auth.users where id in (u(154), u(155), u(156));
