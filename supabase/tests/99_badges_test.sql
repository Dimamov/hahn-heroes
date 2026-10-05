-- Achievement wall: badges appear once the matching thing has happened.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(129, 129) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values (u(129), 'BGAAAAA2', 'Badge A', 5, 'ana');

do $$
declare r jsonb;
begin
  perform as_user(129);
  assert badge_wall() = '[]'::jsonb, 'new hero has none';
  perform as_admin();
  insert into comics (maker, panels) values (u(129), '[{},{},{}]');
  insert into stickers (maker, owner, hero, bg, frame, deco, word) values (u(129), u(129), 'ana', 'violet', 'star', '⭐', 'Hero!');
  perform as_user(129);
  r := badge_wall();
  assert r ? 'comic-creator' and r ? 'sticker-star' and not r ? 'brainiac', 'earned two';
  perform as_admin();
  delete from comics where maker = u(129); delete from stickers where maker = u(129);
end $$;

delete from auth.users where id = u(129);
