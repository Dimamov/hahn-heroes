-- Class race: monthly class totals, class names only, tiny classes left off.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(138, 144) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero)
  select u(n), 'RC' || chr(64 + n - 137) || 'AAAA2', 'Race ' || n, 5, 'ana' from generate_series(138, 144) n;

do $$
declare v_big uuid; v_small uuid; r jsonb; q text;
begin
  perform as_admin();
  insert into classes (teacher_id, name, grade, join_code) values (u(3), 'Race Room Big', 5, 'RCBIGAA2') returning id into v_big;
  insert into classes (teacher_id, name, grade, join_code) values (u(3), 'Race Room Small', 5, 'RCSMLAA2') returning id into v_small;
  insert into class_members (class_id, child_id) values (v_big, u(138)), (v_big, u(139)), (v_big, u(140)), (v_big, u(141)), (v_small, u(142));
  select id into q from questions limit 1;
  insert into question_history (child_id, question_id, answered_at, correct) values (u(138), q, now(), true);

  perform as_user(139);
  r := class_race();
  assert (select count(*) from jsonb_array_elements(r->'classes') c where c->>'name' like 'Race Room%') = 1, 'the small class is left off';
  assert (select (c->>'mine')::boolean from jsonb_array_elements(r->'classes') c where c->>'name' = 'Race Room Big'), 'my class is shown and marked';
  assert (select (c->>'total')::int from jsonb_array_elements(r->'classes') c where c->>'name' = 'Race Room Big') = 2, 'one correct answer counts for 2 points';
  assert not (select bool_or(c ? 'heroes' or c ? 'teacher') from jsonb_array_elements(r->'classes') c), 'names only';
  assert class_race(1) ? 'month', 'last month works';
  perform as_user(142);
  assert not (select bool_or((c->>'mine')::boolean) from jsonb_array_elements(class_race()->'classes') c), 'a member of an unlisted class sees the board but no class marked';

  perform as_admin();
  delete from question_history where child_id = u(138);
  delete from class_members where class_id in (v_big, v_small); delete from classes where id in (v_big, v_small);
end $$;

delete from auth.users where id between u(138) and u(144);
