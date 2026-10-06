-- Teacher character requests: private to the teacher and the Sensei, one step at a time.
\set ON_ERROR_STOP on

do $$
declare r jsonb; v_teacher uuid; v_photo text := 'data:image/jpeg;base64,/9j/AAAA';
begin
  perform as_user(3);
  v_teacher := auth.uid();
  assert teacher_character_get()->>'status' = 'none', 'starts empty';
  perform teacher_character_wish('A staff and a speed power');
  assert teacher_character_get()->>'status' = 'wish', 'wish only';
  perform expect_error($q$select teacher_character_submit('not an image', '')$q$, 'does not work');
  perform expect_error($q$select teacher_character_respond(true, '')$q$, 'no character waiting');
  perform teacher_character_submit(v_photo, 'A staff and a speed power');
  assert teacher_character_get()->>'status' = 'new', 'sent';

  perform as_user(11);
  perform expect_error($q$select teacher_character_get()$q$, 'approved teachers');
  perform expect_error($q$select sensei_character_queue()$q$, 'only the Sensei');
  perform as_user(3);
  perform expect_error($q$select sensei_character_queue()$q$, 'only the Sensei');
  perform expect_error($q$select teacher_character_remove_photo()$q$, 'no photo to remove');

  perform as_user(4);
  r := sensei_character_queue();
  assert jsonb_array_length(r) = 1 and r->0->>'photo' = v_photo and r->0->>'wish' like 'A staff%', 'sensei sees it';
  perform expect_error($q$select sensei_character_deliver('00000000-0000-0000-0000-000000000000', 'data:image/png;base64,AAAA', '')$q$, 'not waiting');
  perform sensei_character_deliver(v_teacher, 'data:image/png;base64,AAAA', 'Staff added');
  assert jsonb_array_length(sensei_character_queue()) = 0, 'queue clears';

  perform as_user(3);
  assert teacher_character_get()->>'status' = 'review' and teacher_character_get()->>'art' is not null, 'back for review';
  perform expect_error($q$select teacher_character_submit('data:image/jpeg;base64,/9j/AAAA', '')$q$, 'ask for changes');
  perform teacher_character_respond(false, 'Make the cape blue');
  assert teacher_character_get()->>'status' = 'changes', 'changes asked';
  perform as_user(4);
  assert sensei_character_queue()->0->>'changeNote' = 'Make the cape blue', 'sensei sees the note';
  perform sensei_character_deliver(v_teacher, 'data:image/png;base64,BBBB', '');
  perform as_user(3);
  perform teacher_character_respond(true, '');
  assert teacher_character_get()->>'status' = 'approved', 'approved';
  perform teacher_character_remove_photo();
  assert teacher_character_get()->>'photo' is null and teacher_character_get()->>'art' is not null, 'photo gone, art stays';

  assert (teacher_character_get()->>'shown')::boolean = false, 'hidden at first';
  perform as_admin();
  declare v_hero uuid;
  begin
    select m.child_id into v_hero from class_members m join classes c on c.id = m.class_id where c.teacher_id = v_teacher limit 1;
    if v_hero is not null then
      perform as_user_id(v_hero);
      assert jsonb_array_length(my_teacher_characters()) = 0, 'class sees nothing until the teacher shows it';
      perform as_user(3);
      perform teacher_character_show(true);
      perform as_user_id(v_hero);
      r := my_teacher_characters();
      assert jsonb_array_length(r) = 1 and r->0->>'art' is not null and r->0 ? 'name', 'class sees the shown character';
      perform as_user(3);
      perform teacher_character_submit('data:image/jpeg;base64,/9j/AAAA', '');
      perform as_user_id(v_hero);
      assert jsonb_array_length(my_teacher_characters()) = 0, 'a new look hides it again';
    end if;
  end;
  perform as_admin();
  delete from teacher_characters;
end $$;
