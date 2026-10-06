-- A teacher can choose to show their approved character to their own class. Off by default, only possible once the
-- character is approved, and it switches off again whenever the teacher asks for a new look.
alter table public.teacher_characters add column shown boolean not null default false;

create or replace function public.teacher_character_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r teacher_characters;
begin
  if not is_role('teacher') then raise exception 'only approved teachers can do that'; end if;
  select * into r from teacher_characters where teacher_id = auth.uid();
  if r.teacher_id is null then
    return jsonb_build_object('status', 'none', 'wish', '', 'photo', null, 'art', null, 'artNote', '', 'changeNote', '', 'shown', false);
  end if;
  return jsonb_build_object('status', r.status, 'wish', r.wish, 'photo', r.photo, 'art', r.art,
    'artNote', r.art_note, 'changeNote', r.change_note, 'shown', r.shown);
end $$;

create or replace function public.teacher_character_submit(p_photo text, p_wish text) returns void
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not is_role('teacher') then raise exception 'only approved teachers can do that'; end if;
  if p_photo is null or p_photo !~ '^data:image/(jpeg|png|webp);base64,' or char_length(p_photo) > 700000 then
    raise exception 'that photo does not work, try a smaller one';
  end if;
  select status into v_status from teacher_characters where teacher_id = auth.uid();
  if v_status = 'review' then raise exception 'approve or ask for changes on the character first'; end if;
  insert into teacher_characters (teacher_id, status, wish, photo)
  values (auth.uid(), 'new', left(trim(coalesce(p_wish, '')), 600), p_photo)
  on conflict (teacher_id) do update
    set status = 'new', wish = excluded.wish, photo = excluded.photo, photo_removed_at = null,
        change_note = '', shown = false, updated_at = now();
end $$;

create function public.teacher_character_show(p_show boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_role('teacher') then raise exception 'only approved teachers can do that'; end if;
  update teacher_characters set shown = coalesce(p_show, false), updated_at = now()
   where teacher_id = auth.uid() and status = 'approved' and art is not null;
  if not found then raise exception 'approve your character first'; end if;
end $$;

-- What a hero sees: the shown, approved characters of the teachers of their own class. Name and art only.
create function public.my_teacher_characters() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('name', a.display_name, 'art', t.art))
    from class_members m join classes c on c.id = m.class_id
    join teacher_characters t on t.teacher_id = c.teacher_id
    join adults a on a.id = c.teacher_id
   where m.child_id = me and a.approved and t.status = 'approved' and t.shown and t.art is not null), '[]'::jsonb);
end $$;
revoke execute on function public.teacher_character_show(boolean), public.my_teacher_characters() from public, anon;
grant execute on function public.teacher_character_show(boolean), public.my_teacher_characters() to authenticated;
