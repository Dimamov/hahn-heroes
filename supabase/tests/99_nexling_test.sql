-- Nexlings: adoption, growth from earned coins, stages, specialties.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(51, 52) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(51), 'NXAAAAA2', 'Nex A', 5, 'ana'), (u(52), 'NXBBBBB2', 'Nex B', 5, 'ana');

select as_admin();
select award(u(51), 'coins', 50, 'sensei', 'before', 'nx-before');   -- earned before adopting (its own transaction): does not count
select pg_sleep(0.05);

do $$
declare r jsonb;
begin
  perform as_user(51);
  r := nexling_state();
  assert r->'mine' = 'null'::jsonb and jsonb_array_length(r->'types') = 7, 'seven types, none adopted';
  perform expect_error($q$select nexling_adopt('nope', 'Fluffy', '#ef4444')$q$, 'no such Nexling');
  perform expect_error($q$select nexling_adopt('emberling', 'F', '#ef4444')$q$, 'letters');
  perform expect_error($q$select nexling_adopt('emberling', 'Fluffy', '#000000')$q$, 'colour');
  perform expect_error($q$select nexling_adopt('emberling', 'Averyveryverylongname', '#ef4444')$q$, 'too long');
  perform nexling_adopt('glimmerling', 'Cinder', '#ef4444');
  r := nexling_state()->'mine';
  assert r->>'nickname' = 'Cinder' and (r->>'growth')::int = 0 and (r->>'stage')::int = 1 and (r->>'next_at')::int = 100, 'fresh hatchling';

  -- events are Glimmerling's specialty (x1.5); other sources count once; xp does not count; spending does not shrink it
  perform as_admin();
  perform pg_sleep(0.05);
  perform award(u(51), 'coins', 40, 'event', 'x', 'nx-1');
  perform award(u(51), 'coins', 20, 'sensei', 'x', 'nx-2');
  perform award(u(51), 'xp', 500, 'sensei', 'x', 'nx-3');
  perform spend(u(51), 30, 'x', 'nx-spend');
  perform as_user(51);
  assert (nexling_state()->'mine'->>'growth')::int = 80, 'growth 40*1.5 + 20';
  perform as_admin();
  perform award(u(51), 'coins', 30, 'event', 'x', 'nx-4');
  perform as_user(51);
  r := nexling_state()->'mine';
  assert (r->>'growth')::int = 125 and (r->>'stage')::int = 2 and (r->>'next_at')::int = 400, 'second stage';

end $$;
select pg_sleep(0.05);
do $$
declare r jsonb;
begin
  perform as_user(51);
  -- renaming keeps growth; switching type starts over
  perform nexling_adopt('glimmerling', 'Blaze', '#3b82f6');
  assert nexling_state()->'mine'->>'nickname' = 'Blaze' and (nexling_state()->'mine'->>'growth')::int = 125, 'rename keeps growth';
  perform nexling_adopt('tideling', 'Drip', '#06b6d4');
  assert (nexling_state()->'mine'->>'growth')::int = 0, 'new type restarts';

  -- another hero is unaffected
  perform as_user(52);
  assert nexling_state()->'mine' = 'null'::jsonb, 'no shared state';
end $$;
