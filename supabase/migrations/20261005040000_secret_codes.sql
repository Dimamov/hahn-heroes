-- Secret codes: a teacher (for their class) or the Sensei (school-wide) makes a code word worth a few
-- diamonds and/or stars. Kids type it in later to redeem. Caps keep the economy steady: teachers get
-- one code a day worth up to 5 diamonds and 25 stars; the Sensei up to 5 codes a day, 50 diamonds and
-- 200 stars each. Each hero redeems a code once, codes last 7 days, and wrong guesses are limited.
create table public.redeem_codes (
  id bigint generated always as identity primary key,
  code text not null unique,
  created_by uuid not null references public.adults (id),
  class_id uuid references public.classes (id) on delete cascade,
  coins int not null default 0 check (coins between 0 and 50),
  xp int not null default 0 check (xp between 0 and 200),
  day date not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (coins + xp > 0)
);
create table public.code_redemptions (
  code_id bigint not null references public.redeem_codes (id) on delete cascade,
  hero_id uuid not null references public.heroes (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code_id, hero_id)
);
create table public.redeem_attempts (
  hero_id uuid not null references public.heroes (id) on delete cascade,
  at timestamptz not null default now()
);
create index redeem_attempts_idx on public.redeem_attempts (hero_id, at);
alter table public.redeem_codes enable row level security;
alter table public.code_redemptions enable row level security;
alter table public.redeem_attempts enable row level security;
revoke all on public.redeem_codes, public.code_redemptions, public.redeem_attempts from anon, authenticated;

create function public.code_make_word() returns text
language plpgsql volatile set search_path = public as $$
declare
  a text[] := array['BRAVE','SWIFT','BRIGHT','LUCKY','HAPPY','MIGHTY','SILLY','SUNNY','COSMIC','GLOWING','CLEVER','KIND','WILD','ROYAL','JOLLY','EPIC'];
  n text[] := array['FOX','OWL','TIGER','COMET','DRAGON','PANDA','ROCKET','WOLF','EAGLE','NINJA','ROBOT','UNICORN','PHOENIX','DOLPHIN','FALCON','LION'];
begin
  return a[1 + floor(random() * 16)::int] || '-' || n[1 + floor(random() * 16)::int] || '-' || (10 + floor(random() * 90)::int);
end $$;

create function public.code_create(p_class uuid, p_coins int, p_xp int, p_announce boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_sensei boolean := is_role('sensei');
  v_day date := school_date(now());
  v_code text;
  v_tries int := 0;
begin
  if not v_sensei then
    if p_class is null or not teaches_class(p_class) then raise exception 'pick one of your classes'; end if;
    if p_coins > 5 or p_xp > 25 then raise exception 'teacher codes can give up to 5 diamonds and 25 stars'; end if;
    if exists (select 1 from redeem_codes where created_by = auth.uid() and day = v_day) then raise exception 'you already made a code today'; end if;
  else
    if p_coins > 50 or p_xp > 200 then raise exception 'too much for one code'; end if;
    if (select count(*) from redeem_codes where created_by = auth.uid() and day = v_day) >= 5 then raise exception 'five codes a day is the limit'; end if;
  end if;
  if coalesce(p_coins, 0) < 0 or coalesce(p_xp, 0) < 0 or coalesce(p_coins, 0) + coalesce(p_xp, 0) <= 0 then raise exception 'give at least something'; end if;
  loop
    v_code := code_make_word();
    exit when not exists (select 1 from redeem_codes where code = v_code);
    v_tries := v_tries + 1;
    if v_tries > 20 then raise exception 'try again'; end if;
  end loop;
  insert into redeem_codes (code, created_by, class_id, coins, xp, day, expires_at)
  values (v_code, auth.uid(), case when v_sensei then null else p_class end, p_coins, p_xp, v_day, now() + interval '7 days');
  if v_sensei and p_announce then
    insert into announcements (title, body, created_by) values ('Secret code!', 'Type this code in the Nexus to win a prize: ' || v_code, auth.uid());
  end if;
  return v_code;
end $$;

create function public.code_mine() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'code', c.code, 'coins', c.coins, 'xp', c.xp, 'expires_at', c.expires_at, 'class', k.name,
           'redeemed', (select count(*) from code_redemptions r where r.code_id = c.id)) order by c.id desc), '[]'::jsonb)
    from (select * from redeem_codes where created_by = auth.uid() order by id desc limit 10) c left join classes k on k.id = c.class_id
   where exists (select 1 from adults a where a.id = auth.uid())
$$;

create function public.code_redeem(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_word text := upper(regexp_replace(btrim(coalesce(p_code, '')), '\s+', '-', 'g'));
  c redeem_codes;
begin
  if (select count(*) from redeem_attempts where hero_id = me and at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_tries');
  end if;
  select * into c from redeem_codes where code = v_word and expires_at > now();
  if c.id is null or (c.class_id is not null and not exists (select 1 from class_members where class_id = c.class_id and child_id = me)) then
    insert into redeem_attempts (hero_id) values (me);
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if exists (select 1 from code_redemptions where code_id = c.id and hero_id = me) then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;
  insert into code_redemptions (code_id, hero_id) values (c.id, me);
  if c.coins > 0 then perform award(me, 'coins', c.coins, 'event', 'Secret code', 'code:' || c.id); end if;
  if c.xp > 0 then perform award(me, 'xp', c.xp, 'event', 'Secret code', 'code:' || c.id); end if;
  return jsonb_build_object('ok', true, 'coins', c.coins, 'xp', c.xp);
end $$;

revoke execute on function public.code_make_word() from public, anon, authenticated;
revoke execute on function public.code_create(uuid, int, int, boolean), public.code_mine(), public.code_redeem(text) from public, anon;
grant execute on function public.code_create(uuid, int, int, boolean), public.code_mine(), public.code_redeem(text) to authenticated;
