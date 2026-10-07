-- Classroom mode: only the teacher switches it, students see whether their class has it on.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(188, 189) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(188), 'CABCDEF4', 'Room A', 5, 'ana'), (u(189), 'CFEDCBA4', 'Room Outsider', 5, 'ana');

do $$
declare c uuid;
begin
  perform as_user(3);
  c := (create_class('Chromebook Room', 5)->>'id')::uuid;
  perform as_admin();
  insert into class_members (class_id, child_id) values (c, u(188));

  perform as_user(188);
  perform expect_error(format($q$select classroom_mode_set(%L, true)$q$, c), 'not your class');
  assert classroom_mode_status() = false, 'off by default';

  perform as_user(3);
  assert classroom_mode_status(c) = false, 'teacher sees off';
  perform classroom_mode_set(c, true);
  assert classroom_mode_status(c) = true, 'teacher sees on';

  perform as_user(188);
  assert classroom_mode_status() = true, 'student sees on';
  perform as_user(189);
  assert classroom_mode_status() = false, 'outsider does not';

  perform as_user(3);
  perform classroom_mode_set(c, false);
  perform as_user(188);
  assert classroom_mode_status() = false, 'off again';
end $$;
