-- Classroom mode: the teacher turns it on for a class. Students on a school Chromebook then get a focused classroom home
-- (live game, learning, class work). The device check happens in the app; this only stores the teacher's switch.
alter table public.classes add column classroom_mode boolean not null default false;

create function public.classroom_mode_set(p_class uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not teaches_class(p_class) then raise exception 'not your class'; end if;
  update classes set classroom_mode = p_on where id = p_class;
end $$;

-- A teacher passes the class. A student leaves it null: true when any class they are in has classroom mode on.
create function public.classroom_mode_status(p_class uuid default null) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_class is not null then
    if not teaches_class(p_class) then raise exception 'not your class'; end if;
    return (select classroom_mode from classes where id = p_class);
  end if;
  return exists (select 1 from class_members m join classes c on c.id = m.class_id where m.child_id = auth.uid() and c.classroom_mode);
end $$;

grant execute on function public.classroom_mode_set(uuid, boolean), public.classroom_mode_status(uuid) to authenticated;
