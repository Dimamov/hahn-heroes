-- HAHN Heroes foundation: settings, hero accounts, kid sign-in limits and the reward ledger.
-- Students can read their own rows. Every write goes through the functions below, so no
-- refresh, retry or edited request can award the same reward twice or change a balance.

-- ---------------------------------------------------------------------------
-- Settings the Sensei can change later without a code release.
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('school_timezone', '"America/New_York"'),
  ('weekly_caps', '{"home_mission": 500, "class_mission": 500}'),
  ('daily_login_coins', '10'),
  ('trivia_night', '{"weekday": "thursday", "time": "18:30"}');

alter table public.app_settings enable row level security;
create policy "settings are readable by signed-in users" on public.app_settings
  for select to authenticated using (true);
revoke insert, update, delete on public.app_settings from anon, authenticated;

create function public.setting(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select value from public.app_settings where key = p_key
$$;

-- The Monday that starts the school week (Monday 00:00 to Sunday 23:59, school time).
create function public.school_week(p_at timestamptz default now()) returns date
language sql stable set search_path = public as $$
  select date_trunc('week', p_at at time zone (public.setting('school_timezone') #>> '{}'))::date
$$;

create function public.school_date(p_at timestamptz default now()) returns date
language sql stable set search_path = public as $$
  select (p_at at time zone (public.setting('school_timezone') #>> '{}'))::date
$$;

-- ---------------------------------------------------------------------------
-- Heroes: one row per student account. Created only by the kid-sign-up function.
-- ---------------------------------------------------------------------------
create table public.heroes (
  id uuid primary key references auth.users (id) on delete cascade,
  hero_code text not null unique check (hero_code ~ '^[A-HJKMNP-Z2-9]{8}$'),
  display_name text not null check (char_length(display_name) between 3 and 40),
  grade smallint not null check (grade in (5, 6)),
  starter_hero text not null check (starter_hero ~ '^(ana|isabella|anayah|luna|kacee|g(0[6-9]|10)|b(0[1-9]|10))$'),
  created_at timestamptz not null default now()
);

alter table public.heroes enable row level security;
create policy "students read their own hero" on public.heroes
  for select to authenticated using (id = auth.uid());
revoke insert, update, delete on public.heroes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Kid sign-in attempts. Only the sign-in function (service role) reads or writes these.
-- ---------------------------------------------------------------------------
create table public.sign_in_attempts (
  id bigint generated always as identity primary key,
  hero_code text not null,
  ip text,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);
create index sign_in_attempts_code_idx on public.sign_in_attempts (hero_code, attempted_at desc);
create index sign_in_attempts_ip_idx on public.sign_in_attempts (ip, attempted_at desc);
alter table public.sign_in_attempts enable row level security;
revoke all on public.sign_in_attempts from anon, authenticated;

-- 5 wrong tries on one hero code rests it for 15 minutes. One network (a whole school can
-- share one) gets 100 wrong tries per 15 minutes before it has to wait.
create function public.check_sign_in(p_hero_code text, p_ip text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_last_success timestamptz;
  v_fails int;
  v_oldest timestamptz;
  v_ip_fails int;
  v_ip_oldest timestamptz;
begin
  select max(attempted_at) into v_last_success
    from sign_in_attempts where hero_code = p_hero_code and succeeded;

  select count(*), min(attempted_at) into v_fails, v_oldest
    from sign_in_attempts
   where hero_code = p_hero_code and not succeeded
     and attempted_at > now() - interval '15 minutes'
     and attempted_at > coalesce(v_last_success, '-infinity');

  if v_fails >= 5 then
    return jsonb_build_object('locked', true,
      'retry_after', ceil(extract(epoch from v_oldest + interval '15 minutes' - now()))::int);
  end if;

  if p_ip is not null then
    select count(*), min(attempted_at) into v_ip_fails, v_ip_oldest
      from sign_in_attempts
     where ip = p_ip and not succeeded and attempted_at > now() - interval '15 minutes';
    if v_ip_fails >= 100 then
      return jsonb_build_object('locked', true,
        'retry_after', ceil(extract(epoch from v_ip_oldest + interval '15 minutes' - now()))::int);
    end if;
  end if;

  return jsonb_build_object('locked', false, 'remaining', 5 - v_fails);
end $$;

create function public.record_sign_in(p_hero_code text, p_ip text, p_succeeded boolean) returns void
language sql security definer set search_path = public as $$
  insert into sign_in_attempts (hero_code, ip, succeeded) values (p_hero_code, p_ip, p_succeeded);
$$;

-- ---------------------------------------------------------------------------
-- Reward ledger. Coins (Nexus points), XP, skill points, Nexling growth and House score are
-- separate currencies. Spending coins never touches XP or other learning progress.
-- ---------------------------------------------------------------------------
create type public.reward_currency as enum ('coins', 'xp', 'skill_points', 'nexling_growth', 'house_score');
create type public.reward_source as enum (
  'home_mission', 'class_mission', 'learning', 'game', 'daily', 'streak', 'event', 'sensei', 'purchase', 'adjustment'
);

create table public.ledger_entries (
  id bigint generated always as identity primary key,
  child_id uuid not null references public.heroes (id) on delete cascade,
  currency public.reward_currency not null,
  amount integer not null,
  requested integer not null,
  source public.reward_source not null,
  reason text not null check (char_length(reason) between 1 and 200),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  school_week date not null,
  created_at timestamptz not null default now(),
  -- One record per reward key: a replayed request finds this row instead of paying again.
  unique (child_id, currency, idempotency_key),
  -- Only purchases and Sensei adjustments take points away.
  check (amount >= 0 or source in ('purchase', 'adjustment')),
  -- A zero row is allowed only when the weekly cap swallowed the award (kept for the recap).
  check (amount <> 0 or requested > 0)
);
create index ledger_entries_child_week_idx on public.ledger_entries (child_id, currency, source, school_week);

alter table public.ledger_entries enable row level security;
create policy "students read their own ledger" on public.ledger_entries
  for select to authenticated using (child_id = auth.uid());
revoke insert, update, delete, truncate on public.ledger_entries from anon, authenticated;

-- The ledger is append-only: corrections are new 'adjustment' rows, never edits.
create function public.ledger_is_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'ledger entries cannot be changed';
end $$;
create trigger ledger_entries_no_update before update on public.ledger_entries
  for each row execute function public.ledger_is_append_only();

create view public.my_balances with (security_invoker = true) as
  select currency, sum(amount)::int as balance
    from public.ledger_entries
   where child_id = auth.uid()
   group by currency;

-- Awards points once per key. Mission coins are capped per school week; anything over the cap
-- is recorded with amount 0 so the weekly recap can say the cap was reached.
-- Called by server code only (edge functions and other security-definer functions).
create function public.award(
  p_child uuid,
  p_currency public.reward_currency,
  p_amount int,
  p_source public.reward_source,
  p_reason text,
  p_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_week date := school_week(now());
  v_cap int;
  v_used int;
  v_grant int := p_amount;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'award amount must be positive';
  end if;
  if p_source = 'purchase' then
    raise exception 'purchases go through spend()';
  end if;

  -- One award at a time per child, so two simultaneous requests can't both pass the cap check.
  perform pg_advisory_xact_lock(hashtextextended(p_child::text, 0));

  if exists (select 1 from ledger_entries
              where child_id = p_child and currency = p_currency and idempotency_key = p_key) then
    return jsonb_build_object('awarded', 0, 'duplicate', true, 'capped', false);
  end if;

  if p_currency = 'coins' then
    v_cap := (setting('weekly_caps') ->> p_source::text)::int;
    if v_cap is not null then
      select coalesce(sum(amount), 0) into v_used
        from ledger_entries
       where child_id = p_child and currency = 'coins' and source = p_source and school_week = v_week;
      v_grant := greatest(0, least(p_amount, v_cap - v_used));
    end if;
  end if;

  insert into ledger_entries (child_id, currency, amount, requested, source, reason, idempotency_key, school_week)
  values (p_child, p_currency, v_grant, p_amount, p_source, p_reason, p_key, v_week);

  return jsonb_build_object('awarded', v_grant, 'duplicate', false, 'capped', v_grant < p_amount);
end $$;

-- Spends coins once per key, never below zero.
create function public.spend(p_child uuid, p_amount int, p_reason text, p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_balance int;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'spend amount must be positive';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_child::text, 0));

  if exists (select 1 from ledger_entries
              where child_id = p_child and currency = 'coins' and idempotency_key = p_key) then
    return jsonb_build_object('ok', true, 'spent', 0, 'duplicate', true);
  end if;

  select coalesce(sum(amount), 0) into v_balance
    from ledger_entries where child_id = p_child and currency = 'coins';
  if v_balance < p_amount then
    return jsonb_build_object('ok', false, 'reason', 'not_enough_coins', 'balance', v_balance);
  end if;

  insert into ledger_entries (child_id, currency, amount, requested, source, reason, idempotency_key, school_week)
  values (p_child, 'coins', -p_amount, p_amount, 'purchase', p_reason, p_key, school_week(now()));

  return jsonb_build_object('ok', true, 'spent', p_amount, 'duplicate', false, 'balance', v_balance - p_amount);
end $$;

-- The daily Nexus check-in: the first reward a student can collect themselves.
-- The server picks the amount and the key, so the app can only ask "collect today's".
create function public.daily_reward_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_child uuid := auth.uid();
  v_amount int := (setting('daily_login_coins') #>> '{}')::int;
begin
  if v_child is null then
    raise exception 'not signed in';
  end if;
  return jsonb_build_object(
    'available', not exists (
      select 1 from ledger_entries
       where child_id = v_child and currency = 'coins' and idempotency_key = 'daily:' || school_date(now())),
    'amount', v_amount);
end $$;

create function public.claim_daily_reward() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_child uuid := auth.uid();
begin
  if v_child is null or not exists (select 1 from heroes where id = v_child) then
    raise exception 'not signed in';
  end if;
  return award(v_child, 'coins', (setting('daily_login_coins') #>> '{}')::int,
               'daily', 'Daily Nexus check-in', 'daily:' || school_date(now()));
end $$;

-- ---------------------------------------------------------------------------
-- Function permissions. Supabase grants new functions to everyone by default, so take that
-- back and hand each one only to the role that should call it.
-- ---------------------------------------------------------------------------
revoke execute on function public.setting(text) from public, anon, authenticated;
revoke execute on function public.check_sign_in(text, text) from public, anon, authenticated;
revoke execute on function public.record_sign_in(text, text, boolean) from public, anon, authenticated;
revoke execute on function public.award(uuid, public.reward_currency, int, public.reward_source, text, text) from public, anon, authenticated;
revoke execute on function public.spend(uuid, int, text, text) from public, anon, authenticated;
revoke execute on function public.daily_reward_status() from public, anon;
revoke execute on function public.claim_daily_reward() from public, anon;

grant execute on function public.check_sign_in(text, text) to service_role;
grant execute on function public.record_sign_in(text, text, boolean) to service_role;
grant execute on function public.award(uuid, public.reward_currency, int, public.reward_source, text, text) to service_role;
grant execute on function public.spend(uuid, int, text, text) to service_role;
grant execute on function public.daily_reward_status() to authenticated;
grant execute on function public.claim_daily_reward() to authenticated;
grant select on public.my_balances to authenticated;
