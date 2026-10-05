-- Goofy challenge: accept once a day, no swapping, honor-system finish pays 5 once, skipping pays nothing.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(149, 150) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(149), 'GFAAAAA2', 'Goof A', 5, 'ana'), (u(150), 'GFBBBBB2', 'Goof B', 5, 'ana');

do $$
declare r jsonb; p int;
begin
  perform as_user(149);
  assert goofy_state()->>'status' is null, 'nothing yet';
  perform expect_error('select goofy_finish(true)', 'no challenge');
  perform expect_error('select goofy_accept(0)', 'bad prompt');
  r := goofy_accept(64);
  assert r->>'status' = 'accepted', 'accepted';
  p := (r->>'prompt')::int;
  assert p between 0 and 63, 'prompt in range';
  assert (goofy_accept(64)->>'prompt')::int = p, 'cannot swap the prompt';
  assert (goofy_finish(true)->>'awarded')::int = 5, 'pays 5';
  perform expect_error('select goofy_finish(true)', 'no challenge');
  assert goofy_state()->>'status' = 'done', 'done';
  assert (goofy_state()->>'done_today')::int = 1, 'count of heroes';

  perform as_user(150);
  perform goofy_accept(64);
  assert (goofy_finish(false)->>'awarded')::int = 0, 'skipping pays nothing';
  assert goofy_state()->>'status' = 'skipped', 'skipped';
  assert (goofy_state()->>'done_today')::int = 1, 'skips are not counted';
  assert not (goofy_state() ? 'who'), 'no names';

  perform as_admin();
  delete from ledger_entries where child_id in (u(149), u(150));
  delete from goofy_log;
end $$;

delete from auth.users where id between u(149) and u(150);
