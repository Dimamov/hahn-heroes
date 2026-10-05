-- Cards, packs and fair trading.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(71, 73) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(71), 'CDAAAAA2', 'Card A', 5, 'ana'), (u(72), 'CDBBBBB2', 'Card B', 5, 'ana'), (u(73), 'CDCCCCC2', 'Card C', 5, 'ana');
insert into public.friendships (a, b, status) values (u(71), u(72), 'accepted');

do $$
declare r jsonb; t uuid; v int; i int;
begin
  -- packs: one welcome pack, three cards, then none left
  perform as_user(71);
  assert (cards_state()->>'packs')::int = 1, 'one welcome pack';
  r := card_open_pack();
  assert jsonb_array_length(r->'cards') = 3 and (r->>'packs')::int = 0, 'three cards, no packs left';
  perform expect_error($q$select card_open_pack()$q$, 'no packs');
  perform as_admin();
  assert (select sum(qty) from hero_cards where hero_id = u(71)) = 3, 'cards stored';

  -- give known cards for the trade tests
  perform as_admin();
  insert into hero_cards (hero_id, card_id, qty) values
    (u(71), 'c-lamp', 3), (u(71), 'r-luna', 1), (u(72), 'c-map', 2), (u(72), 'c-bell', 1), (u(72), 'e-ana', 1)
  on conflict (hero_id, card_id) do update set qty = excluded.qty;
  -- clear random pack cards so the numbers below are exact
  update hero_cards set qty = 0 where hero_id in (u(71), u(72)) and card_id not in ('c-lamp', 'r-luna', 'c-map', 'c-bell', 'e-ana');

  -- showcase
  perform as_user(71);
  perform card_set_showcase('["c-lamp", "r-luna"]');
  perform expect_error($q$select card_set_showcase('["e-ana"]')$q$, 'do not own');
  perform expect_error($q$select card_set_showcase('["c-lamp","r-luna","c-lamp","x"]')$q$, 'up to 3');

  -- only friends trade
  perform expect_error(format($q$select trade_open(%L)$q$, u(73)), 'only trade with friends');
  perform expect_error(format($q$select trade_open(%L)$q$, u(71)), 'only trade with friends');
  t := trade_open(u(72));
  assert trade_open(u(72)) = t, 'one open trade per pair';

  -- offers are checked against what you own
  perform expect_error(format($q$select trade_set(%L, '[{"card":"c-lamp","qty":4}]')$q$, t), 'do not have');
  perform expect_error(format($q$select trade_set(%L, '[{"card":"e-ana","qty":1}]')$q$, t), 'do not have');
  perform expect_error(format($q$select trade_set(%L, '[{"card":"c-lamp","qty":1},{"card":"c-lamp","qty":1}]')$q$, t), 'not valid');
  perform trade_set(t, '[{"card":"r-luna","qty":1}]');
  perform as_user(72);
  perform expect_error(format($q$select trade_confirm(%L, 2, true)$q$, t), 'lopsided');   -- one-sided
  perform trade_set(t, '[{"card":"c-bell","qty":1}]');
  r := trade_view(t);
  assert r->'fairness'->>'level' = 'blocked', 'rare for a common is blocked: ' || r::text;
  perform trade_set(t, '[{"card":"c-map","qty":2},{"card":"c-bell","qty":1}]');
  r := trade_view(t);
  assert r->'fairness'->>'level' in ('uneven', 'blocked'), 'rare vs three commons is not even: ' || r::text;
  perform as_user(71);
  perform trade_set(t, '[{"card":"c-lamp","qty":3}]');
  r := trade_view(t);
  assert r->'fairness'->>'level' = 'ok' and (r->>'ver')::int >= 5, 'three commons for three commons is fine';

  -- both must confirm the same version; a change resets everything
  v := (trade_view(t)->>'ver')::int;
  assert (trade_confirm(t, v, false)->>'done')::boolean = false, 'first confirm waits';
  perform as_user(72);
  assert trade_confirm(t, v - 1, false)->>'reason' = 'changed', 'stale version refused';
  perform trade_set(t, '[{"card":"c-map","qty":1}]');   -- 72 changes their side
  assert not (trade_view(t)->>'i_confirmed')::boolean and not (trade_view(t)->>'they_confirmed')::boolean, 'confirmations reset';
  assert trade_view(t)->'fairness'->>'level' = 'uneven', '3 commons for 1 common: ' || trade_view(t)::text;
  v := (trade_view(t)->>'ver')::int;
  perform expect_error(format($q$select trade_confirm(%L, %s, false)$q$, t, v), 'uneven');
  perform trade_confirm(t, v, true);
  perform as_user(71);
  assert (trade_confirm(t, v, true)->>'done')::boolean, 'both confirmed: done';
  perform as_admin();
  assert (select qty from hero_cards where hero_id = u(71) and card_id = 'c-map') = 1 and (select qty from hero_cards where hero_id = u(71) and card_id = 'c-lamp') = 0, 'A sent lamps, got a map';
  assert (select qty from hero_cards where hero_id = u(72) and card_id = 'c-lamp') = 3 and (select qty from hero_cards where hero_id = u(72) and card_id = 'c-map') = 1, 'B got lamps, sent a map';
  assert (select count(*) from card_trades where id = t and status = 'done') = 1;
  perform as_user(71);
  perform expect_error(format($q$select trade_confirm(%L, %s, true)$q$, t, v), 'closed');

  -- a trade cannot move cards someone no longer has
  t := trade_open(u(72));
  perform trade_set(t, '[{"card":"c-map","qty":1}]');
  perform as_user(72);
  perform trade_set(t, '[{"card":"c-lamp","qty":3}]');
  v := (trade_view(t)->>'ver')::int;
  perform trade_confirm(t, v, true);
  perform as_admin();
  update hero_cards set qty = 0 where hero_id = u(72) and card_id = 'c-lamp';   -- B loses them after confirming
  perform as_user(71);
  assert trade_confirm(t, v, true)->>'reason' = 'missing_cards', 'ownership rechecked at the last moment';
  perform as_admin();
  assert (select qty from hero_cards where hero_id = u(71) and card_id = 'c-map') = 1, 'nothing moved';
  perform as_user(71);
  perform trade_cancel(t);
  assert jsonb_array_length(trade_list()) = 0, 'cancelled trade is gone';

  -- the Sensei can give any card; heroes cannot
  perform as_user(71);
  perform expect_error($q$select sensei_give_card('CDBBBBB2', 'l-sensei')$q$, 'only the Sensei');
  perform as_user(4);
  assert sensei_give_card('cdbbbbb2', 'l-sensei') = 'Card B';
  perform as_user(72);
  assert (select count(*) from jsonb_array_elements(cards_state()->'cards') c where c->>'id' = 'l-sensei') = 1, 'legendary arrived';
end $$;
