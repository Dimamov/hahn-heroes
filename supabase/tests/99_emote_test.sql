-- Emotes: unlocked by XP, set by the hero, seen by friends who visit the room.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(109, 110) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(109), 'EMAAAAA2', 'Emote A', 5, 'ana'), (u(110), 'EMBBBBB2', 'Emote B', 5, 'ana');

do $$
declare r jsonb;
begin
  perform as_user(109);
  assert showcase_state()->>'emote' = 'wave', 'starts with wave';
  perform expect_error($q$select emote_set('dance')$q$, 'not unlocked');
  perform expect_error($q$select emote_set('moonwalk')$q$, 'not unlocked');
  perform as_admin();
  perform award(u(109), 'xp', 160, 'learning', 'emote-xp', 'emote:xp');
  perform as_user(109);
  assert (showcase_state()->>'xp')::int >= 160, 'xp counted';
  perform emote_set('dance');
  assert showcase_state()->>'emote' = 'dance', 'emote saved';
  assert dorm_get()->>'emote' = 'dance', 'own room shows it';
  perform as_user(110);
  perform expect_error(format($q$select dorm_get(%L)$q$, u(109)), 'only friends');
  perform as_admin();
  insert into friendships (a, b, status) values (u(109), u(110), 'accepted');
  perform as_user(110);
  assert dorm_get(u(109))->>'emote' = 'dance', 'a friend sees it';
  perform as_admin();
  delete from friendships where a = u(109);
end $$;

delete from auth.users where id in (u(109), u(110));
