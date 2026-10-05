-- Achievement wall: fun, silly badges worked out from what a hero has already done. Nothing is stored
-- and nothing is paid; the server just reports which badge ids this hero has earned.
create function public.badge_wall() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := me_hero();
  tz text := public.setting('school_timezone') #>> '{}';
  v_correct int; v_answered int;
  v_daily int;
  v_ids text[] := '{}';
begin
  select count(*) filter (where correct), count(*) filter (where answered_at is not null) into v_correct, v_answered from question_history where child_id = me;
  select count(distinct school_date(created_at)) into v_daily from ledger_entries where child_id = me and source = 'daily';
  if v_answered >= 1 then v_ids := array_append(v_ids, 'first-steps'::text); end if;
  if v_correct >= 50 then v_ids := array_append(v_ids, 'brainiac'::text); end if;
  if v_daily >= 7 then v_ids := array_append(v_ids, 'streak-master'::text); end if;
  if exists (select 1 from question_history where child_id = me and answered_at is not null and extract(hour from answered_at at time zone tz) >= 20) then v_ids := array_append(v_ids, 'night-owl'::text); end if;
  if exists (select 1 from question_history where child_id = me and answered_at is not null and extract(hour from answered_at at time zone tz) between 4 and 6) then v_ids := array_append(v_ids, 'early-bird'::text); end if;
  if exists (select 1 from squad_members m join squads s on s.id = m.squad_id where m.child_id = me and m.status = 'member' and s.disbanded_at is null) then v_ids := array_append(v_ids, 'squad-up'::text); end if;
  if (select count(*) from friendships f where f.status = 'accepted' and (f.a = me or f.b = me)) >= 3 then v_ids := array_append(v_ids, 'friendly'::text); end if;
  if (select count(*) from hero_cards where hero_id = me) >= 10 then v_ids := array_append(v_ids, 'collector'::text); end if;
  if (select count(*) from hero_items where hero_id = me) >= 3 then v_ids := array_append(v_ids, 'fashionista'::text); end if;
  if exists (select 1 from nexlings where hero_id = me) then v_ids := array_append(v_ids, 'pet-parent'::text); end if;
  if exists (select 1 from story_progress where hero_id = me and completed_at is not null) then v_ids := array_append(v_ids, 'story-finisher'::text); end if;
  if exists (select 1 from raid_strikes where hero_id = me) then v_ids := array_append(v_ids, 'boss-buster'::text); end if;
  if exists (select 1 from secret_finds where hero_id = me) then v_ids := array_append(v_ids, 'sparkle-spotter'::text); end if;
  if exists (select 1 from comics where maker = me) then v_ids := array_append(v_ids, 'comic-creator'::text); end if;
  if exists (select 1 from stickers where maker = me) then v_ids := array_append(v_ids, 'sticker-star'::text); end if;
  if exists (select 1 from code_redemptions where hero_id = me) then v_ids := array_append(v_ids, 'code-cracker'::text); end if;
  if exists (select 1 from contest_entries where hero_id = me) then v_ids := array_append(v_ids, 'room-showoff'::text); end if;
  if exists (select 1 from ledger_entries where child_id = me and source = 'purchase') then v_ids := array_append(v_ids, 'big-spender'::text); end if;
  return to_jsonb(v_ids);
end $$;

revoke execute on function public.badge_wall() from public, anon;
grant execute on function public.badge_wall() to authenticated;
