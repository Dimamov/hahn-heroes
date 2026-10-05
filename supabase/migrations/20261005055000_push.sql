-- Push notifications. People opt in on their own device. Parents hear about chores waiting for approval and the
-- weekly summary, kids hear about accepted chores, Trivia Night (30 minutes before) and Sensei messages.
-- Nothing is sent at night (9 pm to 7 am school time) unless the person turns quiet hours off.
-- Messages never carry a child's name. The sending itself is the push-send function (needs the VAPID secrets).
create table public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) between 20 and 700 and endpoint like 'https://%'),
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) between 10 and 200),
  auth text not null check (char_length(auth) between 10 and 100),
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id) where disabled_at is null;

create table public.push_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  chore_waiting boolean not null default true,
  weekly_summary boolean not null default true,
  chore_accepted boolean not null default true,
  quiz_soon boolean not null default true,
  sensei_message boolean not null default true,
  quiet_hours boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.push_outbox (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('chore_waiting', 'weekly_summary', 'chore_accepted', 'quiz_soon', 'sensei_message')),
  title text not null,
  body text not null,
  dedupe_key text not null unique,
  send_after timestamptz not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz
);
create index push_outbox_due_idx on public.push_outbox (send_after) where claimed_at is null;

alter table public.push_subscriptions enable row level security;
alter table public.push_prefs enable row level security;
alter table public.push_outbox enable row level security;
revoke all on public.push_subscriptions, public.push_prefs, public.push_outbox from anon, authenticated;
revoke all on sequence public.push_outbox_id_seq from anon, authenticated;

insert into public.app_settings (key, value) values
  ('push_function_url', '"https://reccddfusealreknvjfj.supabase.co/functions/v1/push-send"')
  on conflict (key) do nothing;

-- Person's own device and choices.
create function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  insert into push_subscriptions (endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth)
    on conflict (endpoint) do update set user_id = auth.uid(), p256dh = p_p256dh, auth = p_auth, disabled_at = null;
  insert into push_prefs (user_id) values (auth.uid()) on conflict do nothing;
end $$;

create function public.push_unsubscribe(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  update push_subscriptions set disabled_at = now() where endpoint = p_endpoint and user_id = auth.uid() and disabled_at is null
$$;

create function public.push_prefs_get() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'chore_waiting', p.chore_waiting, 'weekly_summary', p.weekly_summary, 'chore_accepted', p.chore_accepted,
    'quiz_soon', p.quiz_soon, 'sensei_message', p.sensei_message, 'quiet_hours', p.quiet_hours)
  from push_prefs p where p.user_id = auth.uid()
$$;

create function public.push_prefs_set(p_prefs jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  insert into push_prefs (user_id) values (auth.uid()) on conflict do nothing;
  update push_prefs set
    chore_waiting = coalesce((p_prefs ->> 'chore_waiting')::boolean, chore_waiting),
    weekly_summary = coalesce((p_prefs ->> 'weekly_summary')::boolean, weekly_summary),
    chore_accepted = coalesce((p_prefs ->> 'chore_accepted')::boolean, chore_accepted),
    quiz_soon = coalesce((p_prefs ->> 'quiz_soon')::boolean, quiz_soon),
    sensei_message = coalesce((p_prefs ->> 'sensei_message')::boolean, sensei_message),
    quiet_hours = coalesce((p_prefs ->> 'quiet_hours')::boolean, quiet_hours),
    updated_at = now()
   where user_id = auth.uid();
end $$;

-- Queue one message for one person (skipped if they have no device or turned that kind off).
create function public.push_enqueue(p_user uuid, p_kind text, p_title text, p_body text, p_key text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prefs push_prefs;
  v_on boolean;
  v_tz text := setting('school_timezone') #>> '{}';
  v_local timestamp := now() at time zone v_tz;
  v_after timestamptz := now();
begin
  select * into v_prefs from push_prefs where user_id = p_user;
  if v_prefs.user_id is null then return; end if;
  if not exists (select 1 from push_subscriptions where user_id = p_user and disabled_at is null) then return; end if;
  v_on := case p_kind when 'chore_waiting' then v_prefs.chore_waiting when 'weekly_summary' then v_prefs.weekly_summary
    when 'chore_accepted' then v_prefs.chore_accepted when 'quiz_soon' then v_prefs.quiz_soon
    when 'sensei_message' then v_prefs.sensei_message else false end;
  if not v_on then return; end if;
  if v_prefs.quiet_hours and (extract(hour from v_local) >= 21 or extract(hour from v_local) < 7) then
    v_after := (date_trunc('day', v_local) + case when extract(hour from v_local) >= 21 then interval '1 day 7 hours' else interval '7 hours' end) at time zone v_tz;
  end if;
  insert into push_outbox (user_id, kind, title, body, dedupe_key, send_after)
    values (p_user, p_kind, left(p_title, 80), left(p_body, 140), p_key, v_after) on conflict (dedupe_key) do nothing;
end $$;

-- A chore handed in, or accepted.
create function public.push_on_chore() returns trigger
language plpgsql security definer set search_path = public as $$
declare p uuid;
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    for p in select parent_id from parent_links where child_id = new.child_id loop
      perform push_enqueue(p, 'chore_waiting', 'A chore is waiting', 'Your hero finished a chore. Tap to check it.', 'cw:' || new.id || ':' || coalesce(new.submitted_at::text, ''));
    end loop;
  elsif new.status = 'approved' and old.status is distinct from 'approved' then
    perform push_enqueue(new.child_id, 'chore_accepted', 'Chore accepted! 🎉', 'Your grown-up said yes. Your reward is ready.', 'ca:' || new.id || ':' || coalesce(new.reviewed_at::text, ''));
  end if;
  return null;
end $$;
create trigger home_missions_push after update of status on public.home_missions
  for each row execute function public.push_on_chore();

-- A Sensei announcement goes to everyone who opted in.
create function public.push_on_announcement() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  for u in select user_id from push_prefs where sensei_message loop
    perform push_enqueue(u, 'sensei_message', new.title, 'New message from the Sensei', 'an:' || new.id || ':' || u);
  end loop;
  return null;
end $$;
create trigger announcements_push after insert on public.announcements
  for each row execute function public.push_on_announcement();

-- Timed messages, checked every minute: Trivia Night in 30 minutes (kids), Sunday summary (parents).
create function public.push_schedule() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tz text := setting('school_timezone') #>> '{}';
  v_local timestamp := now() at time zone v_tz;
  v_trivia jsonb := setting('trivia_night');
  v_start timestamp;
  u uuid;
begin
  begin
    v_start := v_local::date + (v_trivia ->> 'time')::time;
  exception when others then v_start := null;
  end;
  if v_start is not null
     and lower(btrim(to_char(v_local, 'day'))) = lower(coalesce(v_trivia ->> 'weekday', ''))
     and v_local >= v_start - interval '30 minutes' and v_local < v_start - interval '20 minutes' then
    for u in select p.user_id from push_prefs p join heroes h on h.id = p.user_id where p.quiz_soon loop
      perform push_enqueue(u, 'quiz_soon', 'Trivia Night in 30 minutes! 🧠', 'Get ready to play with your Houses.', 'qz:' || v_local::date || ':' || u);
    end loop;
  end if;
  if extract(dow from v_local) = 0 and extract(hour from v_local) between 17 and 19 then
    for u in select p.user_id from push_prefs p where p.weekly_summary and exists (select 1 from parent_links l where l.parent_id = p.user_id) loop
      perform push_enqueue(u, 'weekly_summary', 'Your weekly summary is ready', 'See how your hero did this week.', 'ws:' || school_week(now()) || ':' || u);
    end loop;
  end if;
end $$;

-- What the push-send function sends next. Marks the messages taken, so nothing goes out twice.
create function public.push_claim() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_out jsonb := '[]'::jsonb;
  v_on boolean;
  v_subs jsonb;
begin
  for r in
    update push_outbox set claimed_at = now()
     where id in (select id from push_outbox where claimed_at is null and send_after <= now() order by id limit 200 for update skip locked)
    returning id, user_id, kind, title, body
  loop
    select case r.kind when 'chore_waiting' then p.chore_waiting when 'weekly_summary' then p.weekly_summary
        when 'chore_accepted' then p.chore_accepted when 'quiz_soon' then p.quiz_soon else p.sensei_message end
      into v_on from push_prefs p where p.user_id = r.user_id;
    select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
      into v_subs from push_subscriptions s where s.user_id = r.user_id and s.disabled_at is null;
    v_out := v_out || jsonb_build_object('id', r.id, 'kind', r.kind, 'title', r.title, 'body', r.body,
      'subs', case when coalesce(v_on, false) then v_subs else '[]'::jsonb end);
  end loop;
  return v_out;
end $$;

create function public.push_finish(p_sent bigint[], p_dead text[]) returns void
language sql security definer set search_path = public as $$
  update push_outbox set sent_at = now() where id = any(coalesce(p_sent, '{}'));
  update push_subscriptions set disabled_at = now() where endpoint = any(coalesce(p_dead, '{}')) and disabled_at is null;
$$;

revoke execute on function public.push_subscribe(text, text, text), public.push_unsubscribe(text), public.push_prefs_get(),
  public.push_prefs_set(jsonb), public.push_enqueue(uuid, text, text, text, text), public.push_on_chore(),
  public.push_on_announcement(), public.push_schedule(), public.push_claim(), public.push_finish(bigint[], text[]) from public, anon;
grant execute on function public.push_subscribe(text, text, text), public.push_unsubscribe(text), public.push_prefs_get(),
  public.push_prefs_set(jsonb) to authenticated;
revoke execute on function public.push_enqueue(uuid, text, text, text, text), public.push_on_chore(), public.push_on_announcement(),
  public.push_schedule(), public.push_claim(), public.push_finish(bigint[], text[]) from authenticated;
grant execute on function public.push_claim(), public.push_finish(bigint[], text[]) to service_role;
