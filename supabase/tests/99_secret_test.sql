-- Weekly secret: everyone can find it once, the first squad wins a card for its members.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(113, 115) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(113), 'SCAAAAA2', 'Secret A', 5, 'ana'), (u(114), 'SCBBBBB2', 'Secret B', 5, 'ana'), (u(115), 'SCCCCCC2', 'Secret C', 5, 'ana');

do $$
declare r jsonb; v_squad uuid; v_week date := school_week(now()); v_card text;
begin
  perform as_admin();
  insert into squads (leader, name) values (u(113), 'Secret Squad') returning id into v_squad;
  insert into squad_members (squad_id, child_id, status) values (v_squad, u(113), 'member'), (v_squad, u(114), 'member');

  perform as_user(115);
  r := secret_state();
  assert r->>'place' is not null and not (r->>'found')::boolean and not (r->>'won')::boolean, 'fresh: ' || r::text;
  v_card := r->'card'->>'id';
  r := secret_find();
  assert (r->>'ok')::boolean and not (r->>'first_squad')::boolean, 'a hero without a squad finds it but wins no squad prize';
  assert secret_find()->>'reason' = 'already_found', 'once each';
  assert secret_claim()->>'reason' = 'not_winner', 'no squad, no card';

  perform as_user(113);
  r := secret_find();
  assert (r->>'ok')::boolean and (r->>'first_squad')::boolean, 'first squad wins';
  assert (secret_state()->>'my_squad_won')::boolean, 'state says so';
  assert (secret_claim()->>'ok')::boolean, 'leader claims';
  assert secret_claim()->>'reason' = 'already_claimed', 'only once';

  perform as_user(114);
  assert (secret_state()->>'my_squad_won')::boolean and not (secret_state()->>'found')::boolean, 'teammate can claim without finding';
  assert (secret_claim()->>'ok')::boolean, 'teammate claims';
  perform as_admin();
  assert (select qty from hero_cards where hero_id = u(114) and card_id = v_card) = 1, 'card delivered';

  perform as_user(113);
  perform expect_error($q$select sensei_secret_view()$q$, 'only the Sensei');
  perform as_user(4);
  assert (sensei_secret_view()->>'finders')::int = 2, 'sensei sees finders';
  perform expect_error($q$select sensei_secret_set('learn', 'x', 'c-hall')$q$, 'already found');
  perform as_admin();
  delete from secret_claims; delete from secret_winners; delete from secret_finds; delete from secret_hunts;
  delete from hero_cards where hero_id in (u(113), u(114), u(115));
  delete from squad_members where squad_id = v_squad; delete from squads where id = v_squad;
  perform as_user(4);
  perform sensei_secret_set('arcade', '', 'c-hall');
  assert sensei_secret_view()->>'place' = 'arcade' and sensei_secret_view()->>'hint' like 'Look where the games%', 'sensei sets it, blank hint uses default';
  perform as_admin();
  delete from secret_hunts;
end $$;

delete from auth.users where id in (u(113), u(114), u(115));
