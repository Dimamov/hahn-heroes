-- AI lesson-to-quiz for teachers. Only approved teachers can use it, with a daily limit.
-- The Claude API key is the ANTHROPIC_API_KEY secret of the lesson-ai edge function, never stored here.
create table public.ai_usage (
  teacher_id uuid not null references public.adults (id) on delete cascade,
  day date not null,
  n int not null default 0,
  primary key (teacher_id, day)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

insert into public.app_settings (key, value) values ('ai_daily_limit', '{"limit": 10}') on conflict (key) do nothing;

-- How many drafts this teacher has left today.
create function public.ai_left() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_limit int := coalesce((setting('ai_daily_limit') ->> 'limit')::int, 10);
begin
  if not is_role('teacher') then raise exception 'only approved teachers can do that'; end if;
  return jsonb_build_object('limit', v_limit,
    'left', greatest(0, v_limit - coalesce((select n from ai_usage where teacher_id = auth.uid() and day = school_date(now())), 0)));
end $$;

-- Uses one draft; says no when the day's limit is reached.
create function public.ai_claim() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_limit int := coalesce((setting('ai_daily_limit') ->> 'limit')::int, 10);
  v_n int;
begin
  if not is_role('teacher') then raise exception 'only approved teachers can do that'; end if;
  insert into ai_usage (teacher_id, day, n) values (auth.uid(), school_date(now()), 0) on conflict do nothing;
  update ai_usage set n = n + 1 where teacher_id = auth.uid() and day = school_date(now()) and n < v_limit returning n into v_n;
  if v_n is null then return jsonb_build_object('ok', false, 'limit', v_limit, 'left', 0); end if;
  return jsonb_build_object('ok', true, 'limit', v_limit, 'left', v_limit - v_n);
end $$;

-- Gives a draft back when the AI call failed.
create function public.ai_refund() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_role('teacher') then raise exception 'only approved teachers can do that'; end if;
  update ai_usage set n = greatest(0, n - 1) where teacher_id = auth.uid() and day = school_date(now());
end $$;

revoke execute on function public.ai_left(), public.ai_claim(), public.ai_refund() from public, anon;
grant execute on function public.ai_left(), public.ai_claim(), public.ai_refund() to authenticated;
