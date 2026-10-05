-- Milestone 2: parents, teachers and the Sensei, home and class missions, announcements,
-- and a limit on how many heroes one network can create.
-- Same rule as the foundation: nobody writes tables directly. Students and adults call the
-- functions below, which check who is asking, and the ledger pays each reward once.

-- ---------------------------------------------------------------------------
-- Adults. Parents are approved on sign-up, teachers wait for the Sensei, and the Sensei
-- role can only be granted by the project owner with SQL (never through the app).
-- ---------------------------------------------------------------------------
create type public.adult_role as enum ('parent', 'teacher', 'sensei');

create table public.adults (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.adult_role not null,
  display_name text not null check (char_length(display_name) between 2 and 60),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.adults enable row level security;
create policy "adults read themselves" on public.adults for select to authenticated using (id = auth.uid());
revoke insert, update, delete on public.adults from anon, authenticated;

create function public.is_role(p_role public.adult_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from adults where id = auth.uid() and role = p_role and approved)
$$;

create function public.register_adult(p_role text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from heroes where id = v_uid) then raise exception 'students cannot be grown-ups'; end if;
  if p_role not in ('parent', 'teacher') then raise exception 'role must be parent or teacher'; end if;
  if char_length(v_name) not between 2 and 60 then raise exception 'name must be 2 to 60 characters'; end if;

  insert into adults (id, role, display_name, approved)
  values (v_uid, p_role::adult_role, v_name, p_role = 'parent')
  on conflict (id) do nothing;

  return (select jsonb_build_object('role', role, 'approved', approved, 'display_name', display_name)
            from adults where id = v_uid);
end $$;

-- ---------------------------------------------------------------------------
-- Failed-code tracking shared by parent linking and class joining.
-- ---------------------------------------------------------------------------
create table public.code_attempts (
  id bigint generated always as identity primary key,
  actor uuid not null,
  kind text not null,
  attempted_at timestamptz not null default now()
);
create index code_attempts_actor_idx on public.code_attempts (actor, kind, attempted_at desc);
alter table public.code_attempts enable row level security;
revoke all on public.code_attempts from anon, authenticated;

-- 10 wrong codes per hour per person, then they wait.
create function public.too_many_code_tries(p_kind text) returns boolean
language sql stable security definer set search_path = public as $$
  select count(*) >= 10 from code_attempts
   where actor = auth.uid() and kind = p_kind and attempted_at > now() - interval '1 hour'
$$;

create function public.random_code(p_length int) returns text
language plpgsql volatile set search_path = public, extensions as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(p_length);
  v_out text := '';
begin
  for i in 0 .. p_length - 1 loop
    v_out := v_out || substr(v_alphabet, (get_byte(v_bytes, i) % 31) + 1, 1);
  end loop;
  return v_out;
end $$;

-- ---------------------------------------------------------------------------
-- Parents: a child makes a one-time code (or QR); the parent signs up with email and
-- password, then enters it.
-- ---------------------------------------------------------------------------
create table public.parent_links (
  child_id uuid not null references public.heroes (id) on delete cascade,
  parent_id uuid not null references public.adults (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (child_id, parent_id)
);
create index parent_links_parent_idx on public.parent_links (parent_id);
alter table public.parent_links enable row level security;
create policy "parents and children read their links" on public.parent_links
  for select to authenticated using (parent_id = auth.uid() or child_id = auth.uid());
revoke insert, update, delete on public.parent_links from anon, authenticated;

create function public.parent_of(p_child uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from parent_links pl join adults a on a.id = pl.parent_id
                  where pl.child_id = p_child and pl.parent_id = auth.uid() and a.role = 'parent' and a.approved)
$$;

create table public.link_codes (
  id bigint generated always as identity primary key,
  child_id uuid not null references public.heroes (id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.adults (id)
);
alter table public.link_codes enable row level security;
create policy "children read their own link codes" on public.link_codes
  for select to authenticated using (child_id = auth.uid());
revoke insert, update, delete on public.link_codes from anon, authenticated;

-- The child's current code, valid for 7 days and one grown-up. A new one is made when the
-- old one was used or ran out.
create function public.create_link_code() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_child uuid := auth.uid();
  v_row link_codes;
begin
  if v_child is null or not exists (select 1 from heroes where id = v_child) then
    raise exception 'only heroes can make a link code';
  end if;
  select * into v_row from link_codes
   where child_id = v_child and used_at is null and expires_at > now()
   order by id desc limit 1;
  if not found then
    insert into link_codes (child_id, code, expires_at)
    values (v_child, random_code(8), now() + interval '7 days')
    returning * into v_row;
  end if;
  return jsonb_build_object('code', v_row.code, 'expires_at', v_row.expires_at);
end $$;

create function public.claim_link_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_parent uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_row link_codes;
  v_child heroes;
begin
  if not is_role('parent') then raise exception 'only parents can link a child'; end if;
  if too_many_code_tries('link') then return jsonb_build_object('ok', false, 'error', 'too_many_tries'); end if;

  select * into v_row from link_codes
   where code = v_code and used_at is null and expires_at > now() for update;
  if not found then
    insert into code_attempts (actor, kind) values (v_parent, 'link');
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  update link_codes set used_at = now(), used_by = v_parent where id = v_row.id;
  insert into parent_links (child_id, parent_id) values (v_row.child_id, v_parent) on conflict do nothing;
  select * into v_child from heroes where id = v_row.child_id;
  return jsonb_build_object('ok', true, 'child_id', v_child.id, 'display_name', v_child.display_name, 'grade', v_child.grade);
end $$;

-- Parents can see their own linked child's hero card details.
create policy "parents read their linked children" on public.heroes
  for select to authenticated using (public.parent_of(id));

-- ---------------------------------------------------------------------------
-- Home missions: parent assigns, child marks done, parent approves, the ledger pays once.
-- ---------------------------------------------------------------------------
create table public.home_missions (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.heroes (id) on delete cascade,
  parent_id uuid not null references public.adults (id),
  title text not null check (char_length(title) between 1 and 80),
  details text not null default '' check (char_length(details) <= 500),
  coins int not null check (coins between 1 and 100),
  status text not null default 'assigned' check (status in ('assigned', 'submitted', 'approved', 'sent_back')),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz
);
create index home_missions_child_idx on public.home_missions (child_id, status);
alter table public.home_missions enable row level security;
create policy "children and their parents read home missions" on public.home_missions
  for select to authenticated using (child_id = auth.uid() or public.parent_of(child_id));
revoke insert, update, delete on public.home_missions from anon, authenticated;

create function public.create_home_mission(p_child uuid, p_title text, p_details text, p_coins int) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not parent_of(p_child) then raise exception 'not your child'; end if;
  insert into home_missions (child_id, parent_id, title, details, coins)
  values (p_child, auth.uid(), btrim(p_title), btrim(coalesce(p_details, '')), p_coins)
  returning id into v_id;
  return v_id;
end $$;

create function public.submit_home_mission(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update home_missions set status = 'submitted', submitted_at = now()
   where id = p_id and child_id = auth.uid() and status in ('assigned', 'sent_back');
  if not found then raise exception 'mission not available'; end if;
end $$;

create function public.review_home_mission(p_id uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_m home_missions;
  v_award jsonb;
begin
  select * into v_m from home_missions where id = p_id for update;
  if not found or not parent_of(v_m.child_id) then raise exception 'mission not found'; end if;
  if v_m.status <> 'submitted' then raise exception 'mission is not waiting for approval'; end if;

  if not p_approve then
    update home_missions set status = 'sent_back', reviewed_at = now() where id = p_id;
    return jsonb_build_object('status', 'sent_back', 'awarded', 0);
  end if;

  update home_missions set status = 'approved', reviewed_at = now() where id = p_id;
  v_award := award(v_m.child_id, 'coins', v_m.coins, 'home_mission', v_m.title, 'home_mission:' || p_id);
  return jsonb_build_object('status', 'approved', 'awarded', (v_award ->> 'awarded')::int,
                            'capped', (v_award ->> 'capped')::boolean);
end $$;

-- A parent sees their linked children, with how many missions wait for them.
create function public.my_children() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', h.id, 'display_name', h.display_name, 'grade', h.grade, 'starter_hero', h.starter_hero,
      'waiting', (select count(*) from home_missions m where m.child_id = h.id and m.status = 'submitted')
    ) order by h.display_name), '[]'::jsonb)
  from parent_links pl
  join heroes h on h.id = pl.child_id
  join adults a on a.id = pl.parent_id and a.role = 'parent' and a.approved
  where pl.parent_id = auth.uid()
$$;

-- What a parent may see about their child's progress.
create function public.child_progress(p_child uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_week date := school_week(now());
begin
  if not parent_of(p_child) then raise exception 'not your child'; end if;
  return jsonb_build_object(
    'coins', coalesce((select sum(amount) from ledger_entries where child_id = p_child and currency = 'coins'), 0),
    'xp', coalesce((select sum(amount) from ledger_entries where child_id = p_child and currency = 'xp'), 0),
    'home_week', coalesce((select sum(amount) from ledger_entries where child_id = p_child and currency = 'coins'
                            and source = 'home_mission' and school_week = v_week), 0),
    'class_week', coalesce((select sum(amount) from ledger_entries where child_id = p_child and currency = 'coins'
                             and source = 'class_mission' and school_week = v_week), 0),
    'home_cap', (setting('weekly_caps') ->> 'home_mission')::int,
    'class_cap', (setting('weekly_caps') ->> 'class_mission')::int);
end $$;

-- ---------------------------------------------------------------------------
-- Classrooms and class missions.
-- ---------------------------------------------------------------------------
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.adults (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  grade smallint not null check (grade in (5, 6)),
  join_code text not null unique,
  created_at timestamptz not null default now()
);
create table public.class_members (
  class_id uuid not null references public.classes (id) on delete cascade,
  child_id uuid not null unique references public.heroes (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, child_id)
);
create function public.teaches_class(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes c join adults a on a.id = c.teacher_id
                  where c.id = p_class and c.teacher_id = auth.uid() and a.role = 'teacher' and a.approved)
$$;
create function public.in_class(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from class_members where class_id = p_class and child_id = auth.uid())
$$;
create function public.teaches_child(p_child uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from class_members m where m.child_id = p_child and public.teaches_class(m.class_id))
$$;

alter table public.classes enable row level security;
alter table public.class_members enable row level security;
create policy "teachers and members read classes" on public.classes
  for select to authenticated using (public.teaches_class(id) or public.in_class(id));
create policy "teachers and members read membership" on public.class_members
  for select to authenticated using (child_id = auth.uid() or public.teaches_class(class_id));
create policy "teachers read their students" on public.heroes
  for select to authenticated using (public.teaches_child(id));
revoke insert, update, delete on public.classes, public.class_members from anon, authenticated;

create function public.create_class(p_name text, p_grade int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row classes;
begin
  if not is_role('teacher') then raise exception 'only approved teachers can make a class'; end if;
  if p_grade not in (5, 6) then raise exception 'grade must be 5 or 6'; end if;
  for i in 1 .. 5 loop
    begin
      insert into classes (teacher_id, name, grade, join_code)
      values (auth.uid(), btrim(p_name), p_grade, random_code(6)) returning * into v_row;
      exit;
    exception when unique_violation then
      if i = 5 then raise; end if;
    end;
  end loop;
  return jsonb_build_object('id', v_row.id, 'name', v_row.name, 'grade', v_row.grade, 'join_code', v_row.join_code);
end $$;

-- A student joins with the teacher's code. The class grade must match the hero's grade.
create function public.join_class(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_child uuid := auth.uid();
  v_hero heroes;
  v_class classes;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  select * into v_hero from heroes where id = v_child;
  if not found then raise exception 'only heroes can join a class'; end if;
  if too_many_code_tries('class') then return jsonb_build_object('ok', false, 'error', 'too_many_tries'); end if;
  if exists (select 1 from class_members where child_id = v_child) then
    return jsonb_build_object('ok', false, 'error', 'already_in_class');
  end if;

  select c.* into v_class from classes c join adults a on a.id = c.teacher_id
   where c.join_code = v_code and a.approved;
  if not found then
    insert into code_attempts (actor, kind) values (v_child, 'class');
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;
  if v_class.grade <> v_hero.grade then
    return jsonb_build_object('ok', false, 'error', 'wrong_grade', 'class_grade', v_class.grade);
  end if;

  insert into class_members (class_id, child_id) values (v_class.id, v_child);
  return jsonb_build_object('ok', true, 'class_id', v_class.id, 'name', v_class.name);
end $$;

create table public.class_missions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  passage text not null default '' check (char_length(passage) <= 4000),
  questions jsonb not null,
  max_coins int not null check (max_coins between 1 and 100),
  created_at timestamptz not null default now()
);
create index class_missions_class_idx on public.class_missions (class_id, created_at desc);
-- The answer key lives in its own table that students can never read.
create table public.class_mission_keys (
  mission_id uuid primary key references public.class_missions (id) on delete cascade,
  answers jsonb not null,
  explanations jsonb not null
);
create table public.class_submissions (
  mission_id uuid not null references public.class_missions (id) on delete cascade,
  child_id uuid not null references public.heroes (id) on delete cascade,
  answers jsonb not null,
  correct int not null,
  total int not null,
  score_pct int not null,
  coins_awarded int not null,
  created_at timestamptz not null default now(),
  primary key (mission_id, child_id)
);

alter table public.class_missions enable row level security;
alter table public.class_mission_keys enable row level security;
alter table public.class_submissions enable row level security;
create policy "class members and teachers read missions" on public.class_missions
  for select to authenticated using (public.teaches_class(class_id) or public.in_class(class_id));
create policy "teachers read answer keys" on public.class_mission_keys
  for select to authenticated using (exists (
    select 1 from class_missions m where m.id = mission_id and public.teaches_class(m.class_id)));
create policy "students and teachers read submissions" on public.class_submissions
  for select to authenticated using (child_id = auth.uid() or exists (
    select 1 from class_missions m where m.id = mission_id and public.teaches_class(m.class_id)));
revoke insert, update, delete on public.class_missions, public.class_mission_keys, public.class_submissions
  from anon, authenticated;

create function public.create_class_mission(
  p_class uuid, p_title text, p_passage text, p_questions jsonb, p_answers jsonb, p_explanations jsonb, p_max_coins int
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_n int;
begin
  if not teaches_class(p_class) then raise exception 'not your class'; end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_typeof(p_answers) <> 'array' or jsonb_typeof(p_explanations) <> 'array' then
    raise exception 'questions, answers and explanations must be lists';
  end if;
  v_n := jsonb_array_length(p_questions);
  if v_n not between 3 and 10 then raise exception 'a mission needs 3 to 10 questions'; end if;
  if jsonb_array_length(p_answers) <> v_n or jsonb_array_length(p_explanations) <> v_n then
    raise exception 'every question needs an answer and an explanation';
  end if;
  for i in 0 .. v_n - 1 loop
    if jsonb_typeof(p_questions -> i -> 'prompt') <> 'string'
       or char_length(p_questions -> i ->> 'prompt') not between 1 and 300
       or jsonb_typeof(p_questions -> i -> 'choices') <> 'array'
       or jsonb_array_length(p_questions -> i -> 'choices') not between 2 and 4
       or jsonb_typeof(p_answers -> i) <> 'number'
       or (p_answers ->> i)::int not between 0 and jsonb_array_length(p_questions -> i -> 'choices') - 1
       or jsonb_typeof(p_explanations -> i) <> 'string'
       or char_length(p_explanations ->> i) > 300 then
      raise exception 'question % is not valid', i + 1;
    end if;
  end loop;

  insert into class_missions (class_id, title, passage, questions, max_coins)
  values (p_class, btrim(p_title), coalesce(p_passage, ''), p_questions, p_max_coins) returning id into v_id;
  insert into class_mission_keys (mission_id, answers, explanations) values (v_id, p_answers, p_explanations);
  return v_id;
end $$;

-- One try per student per mission, graded on the server. 80% or more passes. Coins follow
-- the score: 100% earns the full amount, 90% earns 80% of it, 80% earns 60% of it.
create function public.submit_class_mission(p_mission uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_child uuid := auth.uid();
  v_m class_missions;
  v_key class_mission_keys;
  v_n int;
  v_correct int := 0;
  v_pct int;
  v_coins int := 0;
  v_award jsonb;
  v_review jsonb := '[]'::jsonb;
  v_existing class_submissions;
begin
  select * into v_m from class_missions where id = p_mission;
  if not found or not in_class(v_m.class_id) then raise exception 'mission not found'; end if;
  select * into v_key from class_mission_keys where mission_id = p_mission;
  v_n := jsonb_array_length(v_m.questions);

  select * into v_existing from class_submissions where mission_id = p_mission and child_id = v_child;
  if found then
    return jsonb_build_object('already_done', true, 'correct', v_existing.correct, 'total', v_existing.total,
      'score_pct', v_existing.score_pct, 'coins', v_existing.coins_awarded);
  end if;

  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> v_n then
    raise exception 'answer every question';
  end if;
  for i in 0 .. v_n - 1 loop
    declare v_right boolean := jsonb_typeof(p_answers -> i) = 'number' and (p_answers ->> i)::int = (v_key.answers ->> i)::int;
    begin
      if v_right then v_correct := v_correct + 1; end if;
      v_review := v_review || jsonb_build_object('correct', v_right, 'right_choice', (v_key.answers ->> i)::int,
                                                 'explanation', v_key.explanations ->> i);
    end;
  end loop;

  v_pct := round(100.0 * v_correct / v_n);
  if v_pct >= 80 then
    v_award := award(v_child, 'coins', greatest(1, round(v_m.max_coins * (v_pct - 50) / 50.0)::int),
                     'class_mission', v_m.title, 'class_mission:' || p_mission);
    v_coins := (v_award ->> 'awarded')::int;
  end if;

  insert into class_submissions (mission_id, child_id, answers, correct, total, score_pct, coins_awarded)
  values (p_mission, v_child, p_answers, v_correct, v_n, v_pct, v_coins);

  return jsonb_build_object('already_done', false, 'correct', v_correct, 'total', v_n, 'score_pct', v_pct,
                            'passed', v_pct >= 80, 'coins', v_coins, 'review', v_review);
end $$;

-- A teacher can let one student take a mission again. The reward key stays, so a retake can
-- never pay twice.
create function public.teacher_reset_submission(p_mission uuid, p_child uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from class_missions m where m.id = p_mission and teaches_class(m.class_id)) then
    raise exception 'not your class';
  end if;
  delete from class_submissions where mission_id = p_mission and child_id = p_child;
end $$;

-- ---------------------------------------------------------------------------
-- Announcements and the unread dot.
-- ---------------------------------------------------------------------------
create table public.announcements (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 500),
  created_by uuid not null references public.adults (id),
  created_at timestamptz not null default now()
);
create table public.announcement_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  announcement_id bigint not null references public.announcements (id) on delete cascade,
  primary key (user_id, announcement_id)
);
alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;
create policy "everyone signed in reads announcements" on public.announcements for select to authenticated using (true);
create policy "people read their own read marks" on public.announcement_reads
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.announcements, public.announcement_reads from anon, authenticated;

create function public.post_announcement(p_title text, p_body text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not is_role('sensei') then raise exception 'only the Sensei can post announcements'; end if;
  insert into announcements (title, body, created_by) values (btrim(p_title), btrim(p_body), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function public.unread_announcements() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from announcements a
   where auth.uid() is not null
     and not exists (select 1 from announcement_reads r where r.user_id = auth.uid() and r.announcement_id = a.id)
$$;

create function public.mark_announcements_read() returns void
language sql security definer set search_path = public as $$
  insert into announcement_reads (user_id, announcement_id)
  select auth.uid(), a.id from announcements a where auth.uid() is not null
  on conflict do nothing
$$;

-- ---------------------------------------------------------------------------
-- The Sensei's tools.
-- ---------------------------------------------------------------------------
create function public.sensei_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  return jsonb_build_object(
    'heroes', (select count(*) from heroes),
    'grade5', (select count(*) from heroes where grade = 5),
    'grade6', (select count(*) from heroes where grade = 6),
    'parents', (select count(*) from adults where role = 'parent'),
    'teachers', (select count(*) from adults where role = 'teacher' and approved),
    'pending_teachers', (select count(*) from adults where role = 'teacher' and not approved),
    'classes', (select count(*) from classes),
    'trivia_night', setting('trivia_night'));
end $$;

create function public.list_pending_teachers() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'display_name', a.display_name, 'email', u.email)
                                    order by a.created_at)
                     from adults a join auth.users u on u.id = a.id
                    where a.role = 'teacher' and not a.approved), '[]'::jsonb);
end $$;

create function public.approve_teacher(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  if p_approve then
    update adults set approved = true where id = p_id and role = 'teacher';
  else
    delete from adults where id = p_id and role = 'teacher' and not approved;
  end if;
end $$;

-- Only two settings can be changed from the app; each is checked.
create function public.sensei_set_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  if p_key = 'daily_login_coins' then
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::int not between 0 and 100 then
      raise exception 'daily coins must be 0 to 100';
    end if;
  elsif p_key = 'trivia_night' then
    if (p_value ->> 'weekday') not in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
       or (p_value ->> 'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'trivia night needs a weekday and a time like 18:30';
    end if;
    p_value := jsonb_build_object('weekday', p_value ->> 'weekday', 'time', p_value ->> 'time');
  else
    raise exception 'that setting cannot be changed here';
  end if;
  update app_settings set value = p_value, updated_at = now() where key = p_key;
end $$;

-- ---------------------------------------------------------------------------
-- Limit on new heroes: per network and overall, per hour. Called by kid-signup.
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('signup_limits', '{"per_ip_per_hour": 60, "global_per_hour": 400}');

create table public.signup_log (
  id bigint generated always as identity primary key,
  ip text,
  created_at timestamptz not null default now()
);
create index signup_log_idx on public.signup_log (created_at desc);
create index signup_log_ip_idx on public.signup_log (ip, created_at desc);
alter table public.signup_log enable row level security;
revoke all on public.signup_log from anon, authenticated;

create function public.check_signup(p_ip text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_limits jsonb := setting('signup_limits');
  v_ip int;
  v_all int;
begin
  delete from signup_log where created_at < now() - interval '1 day';
  select count(*) into v_ip from signup_log where ip is not distinct from p_ip and created_at > now() - interval '1 hour';
  select count(*) into v_all from signup_log where created_at > now() - interval '1 hour';
  if v_ip >= (v_limits ->> 'per_ip_per_hour')::int or v_all >= (v_limits ->> 'global_per_hour')::int then
    return jsonb_build_object('allowed', false, 'retry_after', 600);
  end if;
  insert into signup_log (ip) values (p_ip);
  return jsonb_build_object('allowed', true);
end $$;

-- ---------------------------------------------------------------------------
-- Permissions: nothing runs for anyone unless granted here.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
revoke execute on function
  public.is_role(public.adult_role), public.too_many_code_tries(text), public.random_code(int),
  public.parent_of(uuid), public.teaches_class(uuid), public.in_class(uuid), public.teaches_child(uuid),
  public.register_adult(text, text), public.create_link_code(), public.claim_link_code(text), public.my_children(),
  public.create_home_mission(uuid, text, text, int), public.submit_home_mission(uuid),
  public.review_home_mission(uuid, boolean), public.child_progress(uuid),
  public.create_class(text, int), public.join_class(text),
  public.create_class_mission(uuid, text, text, jsonb, jsonb, jsonb, int), public.submit_class_mission(uuid, jsonb),
  public.teacher_reset_submission(uuid, uuid),
  public.post_announcement(text, text), public.unread_announcements(), public.mark_announcements_read(),
  public.sensei_overview(), public.list_pending_teachers(), public.approve_teacher(uuid, boolean),
  public.sensei_set_setting(text, jsonb), public.check_signup(text)
  from authenticated;

-- Row-level-security helpers: only answer "is the signed-in person ...?".
grant execute on function public.parent_of(uuid), public.teaches_class(uuid), public.in_class(uuid),
  public.teaches_child(uuid) to authenticated;

grant execute on function
  public.register_adult(text, text), public.create_link_code(), public.claim_link_code(text), public.my_children(),
  public.create_home_mission(uuid, text, text, int), public.submit_home_mission(uuid),
  public.review_home_mission(uuid, boolean), public.child_progress(uuid),
  public.create_class(text, int), public.join_class(text),
  public.create_class_mission(uuid, text, text, jsonb, jsonb, jsonb, int), public.submit_class_mission(uuid, jsonb),
  public.teacher_reset_submission(uuid, uuid),
  public.post_announcement(text, text), public.unread_announcements(), public.mark_announcements_read(),
  public.sensei_overview(), public.list_pending_teachers(), public.approve_teacher(uuid, boolean),
  public.sensei_set_setting(text, jsonb)
  to authenticated;
grant execute on function public.check_signup(text) to service_role;
