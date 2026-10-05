-- Squad hideout: members place decorations they own; spots and items are not shared out of turn.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(131, 133) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(131), 'SBAAAAA2', 'Base A', 5, 'ana'), (u(132), 'SBBBBBB2', 'Base B', 5, 'ana'), (u(133), 'SBCCCCC2', 'Base C', 5, 'ana');

do $$
declare v_squad uuid; r jsonb;
begin
  perform as_admin();
  insert into squads (leader, name) values (u(131), 'Base Squad') returning id into v_squad;
  insert into squad_members (squad_id, child_id, status) values (v_squad, u(131), 'member'), (v_squad, u(132), 'member');
  insert into hero_items (hero_id, item_id) values (u(131), 'd-lamp'), (u(131), 'd-plant'), (u(132), 'd-lamp'), (u(133), 'd-lamp');

  perform as_user(133);
  assert base_get()->'squad' = 'null'::jsonb, 'no squad, no hideout';
  perform expect_error($q$select base_place(0, 'd-lamp')$q$, 'join a squad');

  perform as_user(131);
  perform expect_error($q$select base_place(30, 'd-lamp')$q$, 'pick a spot');
  perform expect_error($q$select base_place(0, 'd-beanbag')$q$, 'do not own');
  perform base_place(0, 'd-lamp');
  perform base_place(5, 'd-lamp');
  assert jsonb_array_length(base_get()->'items') = 1 and base_get()->'items'->0->>'cell' = '5', 'moving a lamp keeps one copy';
  perform base_place(1, 'd-plant');

  perform as_user(132);
  assert jsonb_array_length(base_get()->'items') = 2, 'squad mate sees the hideout';
  perform expect_error($q$select base_place(5, 'd-lamp')$q$, 'spot is taken');
  perform expect_error($q$select base_place(2, 'd-lamp')$q$, 'already in the hideout');
  perform expect_error($q$select base_remove(1)$q$, 'not your decoration');

  perform as_user(131);
  perform base_remove(5);
  perform as_user(132);
  perform base_place(2, 'd-lamp');
  assert base_get()->'items'->0->>'by' is not null, 'shows who placed it';

  perform as_admin();
  delete from squad_base; delete from hero_items where hero_id in (u(131), u(132), u(133));
  delete from squad_members where squad_id = v_squad; delete from squads where id = v_squad;
end $$;

delete from auth.users where id in (u(131), u(132), u(133));
