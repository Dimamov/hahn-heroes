-- Arcade rewards pay once per game per day and respect the weekly cap.
\set ON_ERROR_STOP on

do $$
declare r jsonb;
begin
  perform as_user(13);
  r := arcade_claim('memory-flip');
  assert (r->>'awarded')::int = 5, 'first win pays 5';
  r := arcade_claim('memory-flip');
  assert (r->>'duplicate')::boolean and (r->>'awarded')::int = 0, 'second win same day pays nothing';
  perform arcade_claim('pattern-pulse');
  perform expect_error($q$select arcade_claim('hacks')$q$, 'unknown game');
  r := arcade_status();
  assert jsonb_array_length(r->'claimed') = 2, 'two games claimed';
  perform as_admin();
  assert (select sum(amount) from ledger_entries where child_id = u(13) and currency = 'xp' and source = 'game') = 6, 'xp once per game';
  perform as_user(1);
  perform expect_error($q$select arcade_claim('memory-flip')$q$, 'not signed in');
  perform as_admin();
end $$;
