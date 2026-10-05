-- Comics: fixed choices only, shared with the maker's squad only.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(119, 121) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(119), 'CMAAAAA2', 'Comic A', 5, 'ana'), (u(120), 'CMBBBBB2', 'Comic B', 5, 'ana'), (u(121), 'CMCCCCC2', 'Comic C', 5, 'ana');

do $$
declare v_squad uuid; v_id bigint;
  good jsonb := '[{"hero":"ana","scene":"hall","pose":"cheer","line":"Let''s go!"},{"hero":"luna","scene":"space","pose":"cool","line":"Awesome!"},{"hero":"b01","scene":"city","pose":"power","line":"We did it!"}]';
begin
  perform as_admin();
  insert into squads (leader, name) values (u(119), 'Comic Squad') returning id into v_squad;
  insert into squad_members (squad_id, child_id, status) values (v_squad, u(119), 'member'), (v_squad, u(120), 'member');

  perform as_user(119);
  perform expect_error($q$select comic_make('[{"hero":"ana","scene":"hall","pose":"cheer","line":"my own words"},{"hero":"ana","scene":"hall","pose":"cheer","line":"Awesome!"},{"hero":"ana","scene":"hall","pose":"cheer","line":"Awesome!"}]'::jsonb)$q$, 'pick from the lists');
  perform expect_error($q$select comic_make('[]'::jsonb)$q$, 'pick from the lists');
  v_id := comic_make(good);
  assert jsonb_array_length(comic_list()) = 1, 'listed';
  perform as_user(120);
  assert jsonb_array_length(comic_squad()) = 0, 'not shared yet';
  perform as_user(119);
  perform comic_share(v_id, true);
  perform as_user(120);
  assert jsonb_array_length(comic_squad()) = 1 and comic_squad()->0->>'maker' = 'Comic A', 'squad mate sees it';
  perform expect_error(format($q$select comic_share(%s, false)$q$, v_id), 'not your comic');
  perform expect_error(format($q$select comic_delete(%s)$q$, v_id), 'not your comic');
  perform as_user(121);
  assert jsonb_array_length(comic_squad()) = 0, 'outsiders see nothing';
  perform expect_error(format($q$select comic_share(%s, true)$q$, v_id), 'join a squad');
  perform as_user(119);
  perform comic_share(v_id, false);
  perform as_user(120);
  assert jsonb_array_length(comic_squad()) = 0, 'unshared';
  perform as_user(119);
  perform comic_delete(v_id);
  assert jsonb_array_length(comic_list()) = 0, 'deleted';

  perform as_admin();
  delete from comics; delete from squad_members where squad_id = v_squad; delete from squads where id = v_squad;
end $$;

delete from auth.users where id in (u(119), u(120), u(121));
