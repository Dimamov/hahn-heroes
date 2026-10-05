-- Stickers: fixed choices only, a price, a daily limit, and gifts only inside a squad.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(116, 118) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(116), 'STAAAAA2', 'Sticker A', 5, 'ana'), (u(117), 'STBBBBB2', 'Sticker B', 5, 'ana'), (u(118), 'STCCCCC2', 'Sticker C', 5, 'ana');

do $$
declare r jsonb; v_squad uuid; v_id bigint;
begin
  perform as_admin();
  perform award(u(116), 'coins', 100, 'event', 'test', 'sticker:test');
  insert into squads (leader, name) values (u(116), 'Sticker Squad') returning id into v_squad;
  insert into squad_members (squad_id, child_id, status) values (v_squad, u(116), 'member'), (v_squad, u(117), 'member');

  perform as_user(116);
  perform expect_error($q$select sticker_make('ana', 'violet', 'plain', '⭐', 'free text here')$q$, 'check');
  perform expect_error($q$select sticker_make('nobody', 'violet', 'plain', '⭐', 'Hero!')$q$, 'check');
  r := sticker_make('ana', 'violet', 'star', '⭐', 'Hero!');
  assert (r->>'ok')::boolean and (r->>'balance')::int = 90, 'costs 10: ' || r::text;
  v_id := (r->>'id')::bigint;
  assert jsonb_array_length(sticker_list()->'stickers') = 1, 'listed';
  assert (sticker_make('ana', 'pink', 'dots', '🔥', 'Brave')->>'ok')::boolean, 'second';
  assert (sticker_make('ana', 'cyan', 'neon', '🚀', 'Cool')->>'ok')::boolean, 'third';
  assert sticker_make('ana', 'gold', 'plain', '🎵', 'Awesome')->>'reason' = 'daily_limit', 'three a day';

  perform expect_error(format($q$select sticker_give(%s, %L)$q$, v_id, u(118)), 'squad');
  perform expect_error(format($q$select sticker_give(%s, %L)$q$, v_id, u(116)), 'squad mate');
  assert (sticker_give(v_id, u(117))->>'ok')::boolean, 'gift to a squad mate';
  perform expect_error(format($q$select sticker_give(%s, %L)$q$, v_id, u(117)), 'not your sticker');
  perform as_user(117);
  assert jsonb_array_length(sticker_list()->'stickers') = 1, 'the gift arrived';
  perform as_user(118);
  perform expect_error($q$select sticker_make('ana', 'violet', 'plain', '⭐', 'Hero!')$q$, 'not enough');

  perform as_admin();
  delete from stickers; delete from squad_members where squad_id = v_squad; delete from squads where id = v_squad;
end $$;

delete from auth.users where id in (u(116), u(117), u(118));
