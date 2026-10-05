-- Jam Session: only squad mates hear each other; pad numbers are validated; the table keeps one row per hero.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(157, 159) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(157), 'JMAAAAA2', 'Jam A', 5, 'ana'), (u(158), 'JMBBBBB2', 'Jam B', 5, 'ana'), (u(159), 'JMCCCCC2', 'Jam C', 5, 'ana');

do $$
declare v_squad uuid; r jsonb;
begin
  perform as_admin();
  insert into squads (leader, name) values (u(157), 'Jam Squad') returning id into v_squad;
  insert into squad_members (squad_id, child_id, status) values (v_squad, u(157), 'member'), (v_squad, u(158), 'member');

  perform as_user(159);
  assert jam_feed()->'squad' = 'null'::jsonb, 'no squad, no jam';
  perform expect_error($q$select jam_hit('{1}')$q$, 'join a squad');

  perform as_user(157);
  perform jam_hit('{1,2,99,-4,23}');
  perform jam_hit('{3}');
  perform as_user(158);
  r := jam_feed();
  assert jsonb_array_length(r->'mates') = 1, 'mate is listed, not me';
  assert (r->'mates'->0->>'seq')::int = 4, 'counted the valid pads only';
  assert r->'mates'->0->'pads' = '[1,2,23,3]'::jsonb, 'bad pad numbers dropped';
  assert (r->'mates'->0->>'live')::boolean, 'recent hit is live';
  perform as_user(157);
  perform jam_hit('{0,0,0,0,0,0,0,0,5}');
  perform as_user(158);
  assert jsonb_array_length(jam_feed()->'mates'->0->'pads') = 8, 'keeps the last 8';
  perform as_admin();
  assert (select count(*) from jam_state where squad_id = v_squad) = 1, 'one row per hero';

  perform as_user(159);
  assert jam_feed()->'squad' = 'null'::jsonb, 'outsider hears nothing';

  perform as_admin();
  delete from jam_state; delete from squad_members where squad_id = v_squad; delete from squads where id = v_squad;
end $$;

delete from auth.users where id in (u(157), u(158), u(159));
