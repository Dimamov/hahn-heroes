-- Active players and traffic: pings are recorded, throttled, and only the Sensei can read the numbers.
\set ON_ERROR_STOP on

select as_user(11);
select ping('home');
select ping('home');            -- throttled: same screen within 45 seconds
select ping('learn');           -- new screen: recorded
select as_user(12);
select ping('Bad Screen!');
select as_user(1);
select ping('missions');

do $$
begin
  perform as_admin();
  assert (select count(*) from presence) = 3, 'three people present';
  assert (select pings from traffic_pings where user_id = u(11)) = 2, 'throttle keeps the count honest';
  assert (select screen from presence where user_id = u(12)) = 'other', 'bad screen names are cleaned';
  perform as_user(11);
  perform expect_error($q$select sensei_traffic()$q$, 'only the Sensei');
  perform expect_error($q$select * from presence$q$, 'permission denied');
  perform expect_error($q$select * from traffic_pings$q$, 'permission denied');
  perform as_user(4);
  declare r jsonb := sensei_traffic();
  begin
    assert (r->>'now_heroes')::int = 2, 'two heroes are active now';
    assert (r->>'now_adults')::int = 1, 'one grown-up active now';
    assert (r->>'today_heroes')::int = 2, 'two heroes today';
    assert jsonb_array_length(r->'days') = 14, 'fourteen days';
    assert jsonb_array_length(r->'hours') = 24, 'twenty-four hours';
    assert jsonb_array_length(r->'active') = 2, 'active list';
    assert (r->'active'->0->>'name') in ('Brave Comet', 'Swift Owl'), 'names shown';
  end;
  perform as_admin();
end $$;
