-- Avatar studio: looks use fixed lists and owned items; pinned looks can be liked once by friends, squad and House.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(134, 137) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(134), 'GKAAAAA2', 'Look A', 5, 'ana'), (u(135), 'GKBBBBB2', 'Look B', 5, 'ana'), (u(136), 'GKCCCCC2', 'Look C', 5, 'ana'), (u(137), 'GKDDDDD2', 'Look D', 5, 'ana');

do $$
declare v_squad uuid; v_outfit text; r jsonb;
begin
  perform as_admin();
  select id into v_outfit from shop_items where kind = 'outfit' order by id limit 1;
  insert into squads (leader, name) values (u(134), 'Look Squad') returning id into v_squad;
  insert into squad_members (squad_id, child_id, status) values (v_squad, u(134), 'member'), (v_squad, u(135), 'member');
  insert into friendships (a, b, status) values (u(134), u(136), 'accepted');

  perform as_user(134);
  perform expect_error($q$select look_save('rainbow-hair', 'none', 'none', null, null, true)$q$, 'pick from the lists');
  perform expect_error(format($q$select look_save('blue', 'none', 'none', %L, null, true)$q$, v_outfit), 'do not own that outfit');
  perform look_save('blue', 'sparkle', 'flame', null, null, false);
  assert look_get()->>'hair' = 'blue' and not (look_get()->>'pinned')::boolean, 'saved, not pinned';
  perform as_user(135);
  assert jsonb_array_length(look_gallery()) = 0, 'not pinned, not shown';
  perform expect_error(format($q$select look_like(%L)$q$, u(134)), 'only like looks');
  perform as_user(134);
  perform look_save('blue', 'sparkle', 'flame', null, null, true);
  perform as_user(135);
  assert jsonb_array_length(look_gallery()) = 1, 'squad mate sees the pinned look';
  perform look_like(u(134));
  perform expect_error(format($q$select look_like(%L)$q$, u(134)), 'already liked');
  perform as_user(136);
  perform look_like(u(134));
  perform as_user(137);
  assert jsonb_array_length(look_gallery()) = 0, 'outsiders see nothing';
  perform expect_error(format($q$select look_like(%L)$q$, u(134)), 'only like looks');
  perform as_user(134);
  assert (look_get()->>'likes')::int = 2, 'two likes';
  perform expect_error(format($q$select look_like(%L)$q$, u(134)), 'only like looks');
  perform look_save('blue', 'sparkle', 'ice', null, null, true);
  assert (look_get()->>'likes')::int = 0, 'a new look starts a fresh count';

  perform as_admin();
  delete from look_likes; delete from hero_looks where hero_id in (u(134));
  delete from friendships where a = u(134);
  delete from squad_members where squad_id = v_squad; delete from squads where id = v_squad;
end $$;

delete from auth.users where id in (u(134), u(135), u(136), u(137));
