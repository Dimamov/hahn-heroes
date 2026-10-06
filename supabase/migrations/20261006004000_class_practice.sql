-- Homework helper: a teacher assigns practice ("20 reading questions by Friday") and sees who finished before class.
-- Progress is the class's real practice answers since it was assigned. No reward of its own: practice already earns.
create table public.class_practice (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  subject text not null check (subject in ('mixed', 'math', 'vocab', 'reading', 'science')),
  target int not null check (target between 5 and 50),
  due_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index class_practice_class_idx on public.class_practice (class_id) where active;
alter table public.class_practice enable row level security;
revoke all on public.class_practice from anon, authenticated;

create function public.class_practice_assign(p_class uuid, p_subject text, p_target int, p_due date) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not teaches_class(p_class) then raise exception 'not your class'; end if;
  if p_due < school_date(now()) then raise exception 'pick a due date that is not in the past'; end if;
  insert into class_practice (class_id, subject, target, due_date) values (p_class, p_subject, p_target, p_due) returning id into v_id;
  return v_id;
end $$;

-- Taking it off the list hides it (soft delete).
create function public.class_practice_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from class_practice where id = p_id and teaches_class(class_id)) then raise exception 'not your class'; end if;
  update class_practice set active = false where id = p_id;
end $$;

-- Done so far for one child on one assignment.
create function public.class_practice_done(p_id uuid, p_child uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from class_practice cp
    join question_history h on h.child_id = p_child and h.answered_at is not null and h.answered_at >= cp.created_at
    join questions q on q.id = h.question_id
   where cp.id = p_id and (cp.subject = 'mixed' or q.subject::text = cp.subject)
$$;
revoke execute on function public.class_practice_done(uuid, uuid) from public, anon, authenticated;

-- Teacher passes the class and sees every student. A student passes null and sees only their own progress.
create function public.class_practice_list(p_class uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if p_class is not null then
    if not teaches_class(p_class) then raise exception 'not your class'; end if;
    return coalesce((select jsonb_agg(jsonb_build_object('id', cp.id, 'subject', cp.subject, 'target', cp.target, 'due', cp.due_date,
        'students', (select coalesce(jsonb_agg(jsonb_build_object('name', h.display_name, 'done', class_practice_done(cp.id, m.child_id)) order by h.display_name), '[]'::jsonb)
                       from class_members m join heroes h on h.id = m.child_id where m.class_id = cp.class_id)) order by cp.due_date, cp.created_at)
      from class_practice cp where cp.class_id = p_class and cp.active), '[]'::jsonb);
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', cp.id, 'subject', cp.subject, 'target', cp.target, 'due', cp.due_date,
        'done', class_practice_done(cp.id, v_me), 'class_name', c.name) order by cp.due_date, cp.created_at)
      from class_practice cp join classes c on c.id = cp.class_id
     where cp.active and exists (select 1 from class_members m where m.class_id = cp.class_id and m.child_id = v_me)
       and (cp.due_date >= school_date(now()) - 3)), '[]'::jsonb);
end $$;

revoke execute on function public.class_practice_assign(uuid, text, int, date), public.class_practice_cancel(uuid), public.class_practice_list(uuid) from public, anon;
grant execute on function public.class_practice_assign(uuid, text, int, date), public.class_practice_cancel(uuid), public.class_practice_list(uuid) to authenticated;
