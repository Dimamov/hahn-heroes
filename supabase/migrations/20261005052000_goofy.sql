-- Goofy challenge: once a day a hero can accept a mystery silly challenge (the prompt is picked when they
-- accept and cannot be swapped), then tap "I did it" on the honor system for 5 diamonds. No photos or video.
-- Everyone sees only how many heroes did it today.
create table public.goofy_log (
  child uuid not null references public.heroes (id) on delete cascade,
  day date not null,
  prompt int not null check (prompt >= 0),
  status text not null default 'accepted' check (status in ('accepted', 'done', 'skipped')),
  created_at timestamptz not null default now(),
  primary key (child, day)
);
alter table public.goofy_log enable row level security;
revoke all on public.goofy_log from anon, authenticated;

create function public.goofy_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := me_hero(); g goofy_log;
begin
  select * into g from goofy_log where child = me and day = school_date(now());
  return jsonb_build_object('status', g.status, 'prompt', g.prompt,
    'done_today', (select count(*) from goofy_log where day = school_date(now()) and status = 'done'));
end $$;

create function public.goofy_accept(p_count int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  if p_count is null or p_count < 1 or p_count > 500 then raise exception 'bad prompt count'; end if;
  insert into goofy_log (child, day, prompt) values (me, school_date(now()), floor(random() * p_count)::int) on conflict do nothing;
  return goofy_state();
end $$;

create function public.goofy_finish(p_done boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero(); g goofy_log; v_got int := 0;
begin
  select * into g from goofy_log where child = me and day = school_date(now()) for update;
  if g.child is null or g.status <> 'accepted' then raise exception 'no challenge waiting'; end if;
  update goofy_log set status = case when p_done then 'done' else 'skipped' end where child = me and day = g.day;
  if p_done then
    v_got := coalesce((award(me, 'coins', 5, 'event', 'Goofy challenge', 'goofy:' || g.day::text)->>'awarded')::int, 0);
  end if;
  return jsonb_build_object('awarded', v_got);
end $$;

revoke execute on function public.goofy_state(), public.goofy_accept(int), public.goofy_finish(boolean) from public, anon;
grant execute on function public.goofy_state(), public.goofy_accept(int), public.goofy_finish(boolean) to authenticated;
