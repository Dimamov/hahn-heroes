-- AI hint helper for practice questions: a per-hero daily limit, and a way for the hint function to read a
-- question from our own bank by id (so it never accepts text from the client).
create table public.hint_usage (
  child uuid not null references public.heroes (id) on delete cascade,
  day date not null,
  n int not null default 0,
  primary key (child, day)
);
alter table public.hint_usage enable row level security;
revoke all on public.hint_usage from anon, authenticated;
insert into public.app_settings (key, value) values ('hint_daily_limit', '{"limit": 6}') on conflict (key) do nothing;

create function public.hint_source(p_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q questions;
begin
  perform me_hero();
  select * into q from questions where id = p_id and active;
  if q.id is null then return null; end if;
  return jsonb_build_object('prompt', q.prompt, 'choices', q.choices);
end $$;

create function public.hint_claim() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_limit int := coalesce((setting('hint_daily_limit') ->> 'limit')::int, 6);
  v_n int;
begin
  insert into hint_usage (child, day, n) values (me, school_date(now()), 0) on conflict do nothing;
  update hint_usage set n = n + 1 where child = me and day = school_date(now()) and n < v_limit returning n into v_n;
  if v_n is null then return jsonb_build_object('ok', false, 'limit', v_limit, 'left', 0); end if;
  return jsonb_build_object('ok', true, 'limit', v_limit, 'left', v_limit - v_n);
end $$;

create function public.hint_refund() returns void
language plpgsql security definer set search_path = public as $$
begin
  update hint_usage set n = greatest(0, n - 1) where child = me_hero() and day = school_date(now());
end $$;

revoke execute on function public.hint_source(text), public.hint_claim(), public.hint_refund() from public, anon;
grant execute on function public.hint_source(text), public.hint_claim(), public.hint_refund() to authenticated;
