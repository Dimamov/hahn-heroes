-- Shop, wardrobe and dorm rooms.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(41, 43) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(41), 'SHAAAAA2', 'Shop A', 5, 'ana'), (u(42), 'SHBBBBB2', 'Shop B', 5, 'ana'), (u(43), 'SHCCCCC2', 'Shop C', 5, 'ana');

do $$
declare r jsonb; bal int;
begin
  perform as_admin();
  perform award(u(41), 'coins', 100, 'sensei', 'test', 'shop-t1');
  perform award(u(41), 'xp', 60, 'sensei', 'test', 'shop-t1');

  perform as_user(41);
  r := shop_state();
  assert (r->>'coins')::int = 100 and (r->>'xp')::int = 60, 'balances shown';
  assert (select count(*) from jsonb_array_elements(r->'items') i where i->>'event' is null) = 34, 'catalog size';
  assert (select (i->>'locked')::boolean from jsonb_array_elements(r->'items') i where i->>'id' = 'a-crown'), 'crown locked';
  assert not (select (i->>'locked')::boolean from jsonb_array_elements(r->'items') i where i->>'id' = 'a-wizard-hat'), 'wizard hat open at 50 xp';

  -- locked, then unaffordable, then a real purchase, then no double charge
  assert shop_buy('a-crown')->>'reason' = 'locked', 'locked item refused';
  assert shop_buy('o-keeper-robe')->>'reason' = 'locked', 'robe locked';
  assert shop_buy('o-storm-cloak')->>'reason' = 'locked', 'cloak needs 100 xp';
  assert (shop_buy('a-wizard-hat')->>'ok')::boolean, 'bought hat';
  assert shop_buy('a-wizard-hat')->>'reason' = 'already_owned', 'no second purchase';
  assert (shop_state()->>'coins')::int = 20, 'charged once';
  assert shop_buy('o-academy-blazer')->>'reason' = 'not_enough_coins', 'too poor';
  perform expect_error($q$select shop_buy('nope')$q$, 'no such item');

  -- equipping
  perform expect_error($q$select hero_equip('hat', 'a-cap')$q$, 'own');
  perform expect_error($q$select hero_equip('face', 'a-wizard-hat')$q$, 'go there');
  perform hero_equip('hat', 'a-wizard-hat');
  assert shop_state()->'equipped'->>'hat' = 'a-wizard-hat', 'hat worn';
  perform hero_equip('hat', null);
  assert shop_state()->'equipped'->>'hat' is null, 'hat off';

  -- the room
  perform as_admin();
  perform award(u(41), 'coins', 100, 'sensei', 'test', 'shop-t2');
  perform as_user(41);
  assert (shop_buy('d-lamp')->>'ok')::boolean and (shop_buy('d-beanbag')->>'ok')::boolean, 'bought decor';
  perform expect_error($q$select dorm_save('[{"item":"d-plant","cell":1}]')$q$, 'own');
  perform expect_error($q$select dorm_save('[{"item":"a-wizard-hat","cell":1}]')$q$, 'own');
  perform expect_error($q$select dorm_save('[{"item":"d-lamp","cell":24}]')$q$, 'not valid');
  perform expect_error($q$select dorm_save('[{"item":"d-lamp","cell":2},{"item":"d-beanbag","cell":2}]')$q$, 'not valid');
  perform expect_error($q$select dorm_save('[{"item":"d-lamp","cell":2},{"item":"d-lamp","cell":3}]')$q$, 'not valid');
  perform expect_error($q$select dorm_save('[{"item":"d-lamp","cell":1.5}]')$q$, 'not valid');
  perform dorm_save('[{"item":"d-lamp","cell":5},{"item":"d-beanbag","cell":2}]');
  r := dorm_get();
  assert r->>'mine' = 'true' and jsonb_array_length(r->'layout') = 2 and r->'layout'->0->>'cell' = '2', 'layout saved in order';
  assert jsonb_array_length(r->'owned') = 2, 'owned decor listed';

  -- only friends visit
  perform as_user(42);
  perform expect_error(format($q$select dorm_get(%L)$q$, u(41)), 'only friends');
  perform as_admin();
  insert into friendships (a, b, status) values (u(42), u(41), 'accepted');
  perform as_user(42);
  r := dorm_get(u(41));
  assert r->>'mine' = 'false' and r->>'name' = 'Shop A' and jsonb_array_length(r->'layout') = 2 and r->'owned' = 'null'::jsonb, 'visit shows the room only';
  perform expect_error($q$select dorm_save('[{"item":"d-lamp","cell":1}]')$q$, 'own');
  perform as_user(43);
  perform expect_error(format($q$select dorm_get(%L)$q$, u(41)), 'only friends');

  perform as_user(41);
  perform dorm_save('[]');
  assert jsonb_array_length(dorm_get()->'layout') = 0, 'room cleared';
end $$;
