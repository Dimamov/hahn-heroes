-- Safety review L1, L7, M3: sign-in IP addresses are kept for 30 days, four helper functions get a
-- fixed search_path, and the Sensei can delete a hero (a parent's or school's request).

create index sign_in_attempts_ip_old_idx on public.sign_in_attempts (attempted_at) where ip is not null;

create or replace function public.record_sign_in(p_hero_code text, p_ip text, p_succeeded boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into sign_in_attempts (hero_code, ip, succeeded) values (p_hero_code, p_ip, p_succeeded);
  update sign_in_attempts set ip = null where ip is not null and attempted_at < now() - interval '30 days';
end $$;

alter function public.chat_clean(text) set search_path = public;
alter function public.odin_new_deck() set search_path = public;
alter function public.odin_playable(text, text, text) set search_path = public;
alter function public.rarity_value(public.card_rarity) set search_path = public;

-- Deletes a hero and everything that belongs to them (the account cascades to every table).
-- Only the Sensei can run it, and it needs the hero's sign-in code, as printed on their card.
create function public.sensei_delete_hero(p_hero_code text) returns text
language plpgsql security definer set search_path = public as $$
declare h heroes;
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do that'; end if;
  select * into h from heroes where hero_code = upper(trim(p_hero_code));
  if h.id is null then raise exception 'no hero has that code'; end if;
  update odin_games set winner = null where winner = h.id;
  delete from shadow_games where shadow = h.id;
  delete from sign_in_attempts where hero_code = h.hero_code;
  delete from auth.users where id = h.id;
  return h.display_name;
end $$;

revoke execute on function public.record_sign_in(text, text, boolean) from public, anon, authenticated;
revoke execute on function public.sensei_delete_hero(text) from public, anon;
grant execute on function public.sensei_delete_hero(text) to authenticated;
