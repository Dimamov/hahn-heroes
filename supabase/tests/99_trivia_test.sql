-- Trivia Night RSVP and the attendance prize.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(81, 83) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(81), 'TVAAAAA2', 'Tri A', 5, 'ana'), (u(82), 'TVBBBBB2', 'Tri B', 5, 'ana'), (u(83), 'TVCCCCC2', 'Tri C', 6, 'ana');

do $$
declare r jsonb; v_date date;
begin
  perform as_admin();
  update app_settings set value = jsonb_build_object('weekday', to_char(school_date(now()), 'FMday'), 'time', '18:30') where key = 'trivia_night';
  v_date := school_date(now());
  perform as_user(81);
  r := trivia_state();
  assert (r->>'date')::date = v_date and (r->>'today')::boolean and r->'going' = 'null'::jsonb, 'tonight, no answer yet';
  assert (trivia_rsvp(true)->>'going_count')::int = 1, 'one in my grade';
  perform as_user(82); perform trivia_rsvp(true);
  perform as_user(83); perform trivia_rsvp(true); perform trivia_rsvp(false);
  assert (trivia_state()->>'going_count')::int = 0 and (trivia_state()->>'going')::boolean = false, 'grade 6 changed their mind';
  perform as_user(81);
  assert (trivia_state()->>'going_count')::int = 2, 'two in grade 5';
  perform expect_error($q$select sensei_trivia_roster()$q$, 'only the Sensei');
  perform expect_error($q$select sensei_trivia_prize(10)$q$, 'only the Sensei');

  -- the Sensei sees who is coming and can give the prize once
  perform as_user(4);
  r := sensei_trivia_roster();
  assert jsonb_array_length(r->'grades') = 1 and (r->'grades'->0->>'going')::int = 2, 'only grade 5 is coming';
  perform expect_error($q$select sensei_trivia_prize(500)$q$, 'pick 1 to 100');
  assert sensei_trivia_prize(10) = 2, 'two heroes got the prize';
  assert sensei_trivia_prize(10) = 0, 'a second press changes nothing';
  perform as_admin();
  assert (select sum(amount) from ledger_entries where child_id = u(81) and idempotency_key = 'trivia:' || v_date) = 10, 'ten points';
  assert (select count(*) from ledger_entries where child_id = u(83) and idempotency_key like 'trivia:%') = 0, 'not coming, no prize';

  -- another night is another date
  perform as_admin();
  update app_settings set value = jsonb_build_object('weekday', to_char(school_date(now()) + 1, 'FMday'), 'time', '18:30') where key = 'trivia_night';
  assert (select (trivia_next_date() - school_date(now()))) = 1, 'tomorrow';
  update app_settings set value = jsonb_build_object('weekday', to_char(school_date(now()), 'FMday'), 'time', '18:30') where key = 'trivia_night';
end $$;
