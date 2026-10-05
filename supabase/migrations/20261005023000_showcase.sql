-- Hero showcase: a badge title earned through play, and a pose, shown on the profile.
create table public.hero_showcase (
  hero_id uuid primary key references public.heroes (id) on delete cascade,
  title text not null default 'rookie',
  pose text not null default 'stand' check (pose in ('stand', 'cheer', 'cool', 'power')),
  updated_at timestamptz not null default now()
);
alter table public.hero_showcase enable row level security;
revoke all on public.hero_showcase from anon, authenticated;

-- Which titles a hero has earned. Each one is worked out from what they actually did.
create function public.title_unlocked(p_hero uuid, p_title text) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_title
    when 'rookie' then true
    when 'keeper' then exists (select 1 from story_progress where hero_id = p_hero and completed_at is not null)
    when 'detective' then exists (select 1 from adv_done d join adv_cases c on c.case_id = d.case_id where d.hero_id = p_hero and c.kind = 'lab')
    when 'chronicler' then exists (select 1 from adv_done where hero_id = p_hero and case_id = 'chron1')
    when 'streak' then exists (select 1 from ledger_entries where child_id = p_hero and currency = 'coins' and idempotency_key like 'streak:%:7')
    when 'collector' then (select count(*) from hero_cards where hero_id = p_hero and qty > 0) >= 20
    when 'helper' then exists (select 1 from ledger_entries where child_id = p_hero and currency = 'coins' and idempotency_key like 'hchal:%')
    when 'scholar' then hero_xp(p_hero) >= 500
    else false
  end
$$;

create function public.showcase_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  s hero_showcase;
begin
  select * into s from hero_showcase where hero_id = me;
  return jsonb_build_object('title', coalesce(s.title, 'rookie'), 'pose', coalesce(s.pose, 'stand'),
    'unlocked', (select jsonb_agg(t) from unnest(array['rookie','keeper','detective','chronicler','streak','collector','helper','scholar']) t where title_unlocked(me, t)));
end $$;

create function public.showcase_set(p_title text, p_pose text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  if p_pose not in ('stand', 'cheer', 'cool', 'power') then raise exception 'no such pose'; end if;
  if not title_unlocked(me, p_title) then raise exception 'you have not earned that title yet'; end if;
  insert into hero_showcase (hero_id, title, pose) values (me, p_title, p_pose)
  on conflict (hero_id) do update set title = excluded.title, pose = excluded.pose, updated_at = now();
end $$;

revoke execute on function public.title_unlocked(uuid, text), public.showcase_state(), public.showcase_set(text, text) from public, anon;
grant execute on function public.showcase_state(), public.showcase_set(text, text) to authenticated;
