-- Safety review H1: the sign-in code stays secret. Friends use a separate friend code that cannot
-- sign in (and can be changed), friend-code guessing is limited, and repeated wrong sign-ins rest
-- the hero code for longer each time.

alter table public.heroes add column friend_code text unique check (friend_code ~ '^[A-HJKMNP-Z2-9]{6}$');

create function public.gen_friend_code() returns text
language plpgsql volatile set search_path = public as $$
declare v text;
begin
  loop
    v := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from heroes where friend_code = v);
  end loop;
  return v;
end $$;

update public.heroes set friend_code = public.gen_friend_code() where friend_code is null;
alter table public.heroes alter column friend_code set not null;

create function public.heroes_friend_code_default() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.friend_code is null then new.friend_code := gen_friend_code(); end if;
  return new;
end $$;
create trigger heroes_friend_code before insert on public.heroes
for each row execute function public.heroes_friend_code_default();

-- Wrong friend codes are recorded (ten in ten minutes pauses guessing) and answered with a null name.
create table public.friend_misses (
  id bigint generated always as identity primary key,
  hero_id uuid not null references public.heroes (id) on delete cascade,
  at timestamptz not null default now()
);
create index friend_misses_idx on public.friend_misses (hero_id, at desc);
alter table public.friend_misses enable row level security;
revoke all on public.friend_misses from anon, authenticated;

create or replace function public.friend_request(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_other heroes;
  v_row friendships;
begin
  if (select count(*) from friend_misses where hero_id = me and at > now() - interval '10 minutes') >= 10 then
    raise exception 'too many tries, wait a few minutes';
  end if;
  select * into v_other from heroes where friend_code = upper(trim(p_code));
  if v_other.id is null then
    insert into friend_misses (hero_id) values (me);
    return jsonb_build_object('name', null);
  end if;
  if v_other.id = me then raise exception 'that is your own code'; end if;
  select * into v_row from friendships where least(a, b) = least(me, v_other.id) and greatest(a, b) = greatest(me, v_other.id);
  if v_row.id is not null then
    if v_row.status in ('pending', 'accepted') then raise exception 'already friends or waiting'; end if;
    update friendships set a = me, b = v_other.id, status = 'pending', decided_at = null where id = v_row.id;
  else
    insert into friendships (a, b) values (me, v_other.id);
  end if;
  return jsonb_build_object('name', v_other.display_name);
end $$;

-- A hero can change their friend code at any time (existing friends stay friends).
create function public.friend_code_reset() returns text
language plpgsql security definer set search_path = public as $$
declare v text := gen_friend_code();
begin
  update heroes set friend_code = v where id = me_hero();
  return v;
end $$;

-- Escalating rests: 5 wrong tries in 15 minutes rest the code for 15 minutes; 10 wrong tries in a
-- row (within a day) for an hour; 15 for a day. A correct sign-in clears the count.
create or replace function public.check_sign_in(p_hero_code text, p_ip text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_last_success timestamptz;
  v_fails int;
  v_oldest timestamptz;
  v_total int;
  v_last_fail timestamptz;
  v_ip_fails int;
  v_ip_oldest timestamptz;
  v_until timestamptz;
begin
  select max(attempted_at) into v_last_success
    from sign_in_attempts where hero_code = p_hero_code and succeeded;

  select count(*), max(attempted_at) into v_total, v_last_fail
    from sign_in_attempts
   where hero_code = p_hero_code and not succeeded
     and attempted_at > now() - interval '24 hours'
     and attempted_at > coalesce(v_last_success, '-infinity');

  if v_total >= 15 then v_until := v_last_fail + interval '24 hours';
  elsif v_total >= 10 then v_until := v_last_fail + interval '1 hour';
  end if;
  if v_until is not null and v_until > now() then
    return jsonb_build_object('locked', true, 'retry_after', ceil(extract(epoch from v_until - now()))::int);
  end if;

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

revoke execute on function public.gen_friend_code(), public.heroes_friend_code_default(), public.check_sign_in(text, text)
  from public, anon, authenticated;
revoke execute on function public.friend_request(text), public.friend_code_reset() from public, anon;
grant execute on function public.friend_request(text), public.friend_code_reset() to authenticated;
