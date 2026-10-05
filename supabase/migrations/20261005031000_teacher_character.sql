-- Teacher character requests. A teacher can send a photo and a wish list; the Sensei makes the
-- character art outside the app and sends it back; the teacher approves it or asks for changes.
-- Photos and art live only in this closed table: the owning teacher and the Sensei can read them,
-- students never can. The wish list is a request the Sensei reviews, not a promise.
create table public.teacher_characters (
  teacher_id uuid primary key references public.adults (id) on delete cascade,
  status text not null default 'wish' check (status in ('wish', 'new', 'review', 'changes', 'approved')),
  wish text not null default '' check (char_length(wish) <= 600),
  photo text check (photo is null or (photo ~ '^data:image/(jpeg|png|webp);base64,' and char_length(photo) <= 700000)),
  photo_removed_at timestamptz,
  art text check (art is null or (art ~ '^data:image/(jpeg|png|webp);base64,' and char_length(art) <= 2000000)),
  art_note text not null default '' check (char_length(art_note) <= 300),
  change_note text not null default '' check (char_length(change_note) <= 300),
  updated_at timestamptz not null default now()
);
alter table public.teacher_characters enable row level security;
revoke all on public.teacher_characters from anon, authenticated;

create function public.teacher_character_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r teacher_characters;
begin
  if not is_role('teacher') then raise exception 'only approved teachers can do that'; end if;
  select * into r from teacher_characters where teacher_id = auth.uid();
  if r.teacher_id is null then
    return jsonb_build_object('status', 'none', 'wish', '', 'photo', null, 'art', null, 'artNote', '', 'changeNote', '');
  end if;
  return jsonb_build_object('status', r.status, 'wish', r.wish, 'photo', r.photo, 'art', r.art,
    'artNote', r.art_note, 'changeNote', r.change_note);
end $$;

-- Saves the wish list (kept as a request; the Sensei reads it when making the character).
create function public.teacher_character_wish(p_wish text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_role('teacher') then raise exception 'only approved teachers can do that'; end if;
  insert into teacher_characters (teacher_id, wish) values (auth.uid(), left(trim(coalesce(p_wish, '')), 600))
  on conflict (teacher_id) do update set wish = excluded.wish, updated_at = now();
end $$;

-- Sends the photo to the Sensei. Not allowed while the Sensei's art is waiting for the teacher.
create function public.teacher_character_submit(p_photo text, p_wish text) returns void
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
        change_note = '', updated_at = now();
end $$;

-- Teacher approves the art or asks for changes.
create function public.teacher_character_respond(p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_role('teacher') then raise exception 'only approved teachers can do that'; end if;
  update teacher_characters
     set status = case when p_approve then 'approved' else 'changes' end,
         change_note = case when p_approve then '' else left(trim(coalesce(p_note, '')), 300) end,
         updated_at = now()
   where teacher_id = auth.uid() and status = 'review';
  if not found then raise exception 'there is no character waiting for you'; end if;
end $$;

-- Teacher removes their photo (the art stays). Not while the Sensei is working from it.
create function public.teacher_character_remove_photo() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_role('teacher') then raise exception 'only approved teachers can do that'; end if;
  update teacher_characters set photo = null, photo_removed_at = now(), updated_at = now()
   where teacher_id = auth.uid() and status in ('wish', 'review', 'approved', 'changes') and photo is not null;
  if not found then raise exception 'there is no photo to remove right now'; end if;
end $$;

-- Sensei's list: requests that need art (new, or changes asked for).
create function public.sensei_character_queue() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do that'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('teacherId', c.teacher_id, 'name', a.display_name, 'status', c.status,
      'wish', c.wish, 'photo', c.photo, 'changeNote', c.change_note) order by c.updated_at)
    from (select * from teacher_characters where status in ('new', 'changes') order by updated_at limit 10) c
    join adults a on a.id = c.teacher_id), '[]'::jsonb);
end $$;

-- Sensei sends the finished art back to the teacher for approval. Nothing shows to students.
create function public.sensei_character_deliver(p_teacher uuid, p_art text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do that'; end if;
  if p_art is null or p_art !~ '^data:image/(jpeg|png|webp);base64,' or char_length(p_art) > 2000000 then
    raise exception 'that image does not work, try a smaller one';
  end if;
  update teacher_characters
     set art = p_art, art_note = left(trim(coalesce(p_note, '')), 300), status = 'review', updated_at = now()
   where teacher_id = p_teacher and status in ('new', 'changes');
  if not found then raise exception 'that request is not waiting for art'; end if;
end $$;

revoke execute on function public.teacher_character_get(), public.teacher_character_wish(text),
  public.teacher_character_submit(text, text), public.teacher_character_respond(boolean, text),
  public.teacher_character_remove_photo(), public.sensei_character_queue(),
  public.sensei_character_deliver(uuid, text, text) from public, anon;
grant execute on function public.teacher_character_get(), public.teacher_character_wish(text),
  public.teacher_character_submit(text, text), public.teacher_character_respond(boolean, text),
  public.teacher_character_remove_photo(), public.sensei_character_queue(),
  public.sensei_character_deliver(uuid, text, text) to authenticated;
