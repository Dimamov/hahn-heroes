-- Seasonal events: items sell only while the event is live; owned items stay.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(103, 103) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(103), 'EVAAAAA2', 'Event A', 5, 'ana');

do $$
declare r jsonb;
begin
  perform as_admin();
  perform award(u(103), 'coins', 400, 'sensei', 'test coins', 'evtest:coins');
  -- a window around today
  update seasonal_events set starts = school_date(now()) + 30, ends = school_date(now()) + 40, enabled = true where id <> 'fall';
  update seasonal_events set starts = school_date(now()) - 1, ends = school_date(now()) + 5, enabled = true where id = 'fall';

  perform as_user(103);
  r := shop_state();
  assert exists (select 1 from jsonb_array_elements(r->'items') i where i->>'id' = 'd-pumpkin'), 'live event item is for sale';
  assert not exists (select 1 from jsonb_array_elements(r->'items') i where i->>'id' = 'd-snowman'), 'future event item is hidden';
  assert jsonb_array_length(r->'events') = 1 and r->'events'->0->>'id' = 'fall' and (r->'events'->0->>'live')::boolean, 'banner: ' || r::text;
  assert shop_buy('d-snowman')->>'reason' = 'event_over', 'cannot buy before it starts';
  assert (shop_buy('d-pumpkin')->>'ok')::boolean, 'buy a live item';

  -- the Sensei switches the event off: unowned items vanish, the owned one stays
  perform expect_error($q$select sensei_set_event('fall', current_date, current_date + 3, false)$q$, 'only the Sensei');
  perform as_user(4);
  perform expect_error($q$select sensei_set_event('fall', current_date + 3, current_date, true)$q$, 'end date');
  perform expect_error($q$select sensei_set_event('fall', current_date, current_date + 200, true)$q$, '90 days');
  perform expect_error($q$select sensei_set_event('nope', current_date, current_date + 3, true)$q$, 'no such event');
  perform sensei_set_event('fall', current_date, current_date + 3, false);
  assert jsonb_array_length(sensei_events()) = 3, 'sensei sees all events';
  perform as_user(103);
  r := shop_state();
  assert jsonb_array_length(r->'events') = 0, 'no banner while off';
  assert not exists (select 1 from jsonb_array_elements(r->'items') i where i->>'id' = 'a-leaf-crown'), 'unowned item hidden';
  assert exists (select 1 from jsonb_array_elements(r->'items') i where i->>'id' = 'd-pumpkin' and (i->>'owned')::boolean), 'owned item stays';
  assert shop_buy('a-leaf-crown')->>'reason' = 'event_over', 'cannot buy while off';
  perform as_user(4);
  perform sensei_set_event('fall', current_date - 1, current_date + 5, true);
  perform as_user(103);
  assert (shop_buy('a-leaf-crown')->>'ok')::boolean, 'back on';

  -- put the real dates back for the tests that follow
  perform as_admin();
  update seasonal_events set starts = '2026-10-12', ends = '2026-11-02', enabled = true where id = 'fall';
  update seasonal_events set starts = '2026-12-01', ends = '2027-01-05', enabled = true where id = 'winter';
  update seasonal_events set starts = '2027-03-15', ends = '2027-04-15', enabled = true where id = 'spring';
end $$;
