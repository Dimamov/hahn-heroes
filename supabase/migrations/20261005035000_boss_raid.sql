-- School boss raid: one boss a week for the whole school. Each hero can strike once per school day;
-- the strike's power comes from what they learned that day. Everyone who struck collects a reward
-- once if the school brings the boss down before the week ends.
insert into public.app_settings (key, value) values ('raid', '{"hp_per_hero": 60, "min_hp": 400, "coins": 30, "xp": 10}') on conflict (key) do nothing;

create table public.raid_bosses (
  id text primary key,
  name text not null,
  icon text not null,
  blurb text not null
);
alter table public.raid_bosses enable row level security;
revoke all on public.raid_bosses from anon, authenticated;
insert into public.raid_bosses (id, name, icon, blurb) values
  ('glitch', 'The Glitch Dragon', '🐲', 'It scrambles the Nexus numbers. Answer right to unscramble it!'),
  ('static', 'Static Golem', '🗿', 'A rock giant made of noise. Quiet it with knowledge.'),
  ('shadow', 'Shadow Wisp', '👻', 'It hides in the dark corners of the Nexus. Shine some light!'),
  ('storm', 'Storm Kraken', '🐙', 'It stirs up wild storms. Calm the waves together.'),
  ('frost', 'Frost Titan', '🧊', 'A freezing giant. Heat it up with hot streaks!'),
  ('ember', 'Ember Phoenix', '🔥', 'A fiery bird. Cool it down with cool heads.');

create table public.raid_weeks (
  week date primary key,
  boss_id text not null references public.raid_bosses (id),
  max_hp int not null check (max_hp > 0)
);
alter table public.raid_weeks enable row level security;
revoke all on public.raid_weeks from anon, authenticated;

create table public.raid_strikes (
  hero_id uuid not null references public.heroes (id) on delete cascade,
  day date not null,
  week date not null references public.raid_weeks (week),
  damage int not null check (damage > 0),
  primary key (hero_id, day)
);
create index raid_strikes_week_idx on public.raid_strikes (week);
alter table public.raid_strikes enable row level security;
revoke all on public.raid_strikes from anon, authenticated;

-- Makes sure this week has a boss and a fixed amount of health (set the first time anyone looks).
create function public.raid_week_row() returns raid_weeks
language plpgsql security definer set search_path = public as $$
declare
  v_week date := school_week(now());
  r raid_weeks;
  v_cfg jsonb := setting('raid');
  v_boss text;
begin
  select * into r from raid_weeks where week = v_week;
  if r.week is not null then return r; end if;
  select id into v_boss from raid_bosses order by id offset (extract(epoch from v_week)::bigint / 604800) % (select count(*) from raid_bosses) limit 1;
  insert into raid_weeks (week, boss_id, max_hp)
  values (v_week, v_boss, greatest((v_cfg->>'min_hp')::int, (v_cfg->>'hp_per_hero')::int * (select count(*)::int from heroes)))
  on conflict (week) do nothing;
  select * into r from raid_weeks where week = v_week;
  return r;
end $$;

-- Today's strike power: 10 for showing up, plus 3 for every right answer today (up to 60).
create function public.raid_power(p_hero uuid) returns int
language sql stable security definer set search_path = public as $$
  select 10 + least(60, 3 * (select count(*)::int from question_history h
                              where h.child_id = p_hero and h.correct and school_date(h.answered_at) = school_date(now())))
$$;

create function public.raid_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  w raid_weeks := raid_week_row();
  b raid_bosses;
  v_dmg int;
  v_cfg jsonb := setting('raid');
begin
  select * into b from raid_bosses where id = w.boss_id;
  select coalesce(sum(damage), 0) into v_dmg from raid_strikes where week = w.week;
  return jsonb_build_object(
    'boss', jsonb_build_object('id', b.id, 'name', b.name, 'icon', b.icon, 'blurb', b.blurb),
    'max_hp', w.max_hp, 'damage', least(v_dmg, w.max_hp),
    'defeated', v_dmg >= w.max_hp,
    'strikers', (select count(distinct hero_id) from raid_strikes where week = w.week),
    'struck_today', exists (select 1 from raid_strikes where hero_id = me and day = school_date(now())),
    'power', raid_power(me),
    'my_damage', coalesce((select sum(damage) from raid_strikes where hero_id = me and week = w.week), 0),
    'can_claim', v_dmg >= w.max_hp and exists (select 1 from raid_strikes where hero_id = me and week = w.week)
                 and not exists (select 1 from ledger_entries where child_id = me and currency = 'coins' and idempotency_key = 'raid:' || w.week),
    'claimed', exists (select 1 from ledger_entries where child_id = me and currency = 'coins' and idempotency_key = 'raid:' || w.week),
    'reward', jsonb_build_object('coins', (v_cfg->>'coins')::int, 'xp', (v_cfg->>'xp')::int));
end $$;

-- One strike a day. Once the boss is down there is nothing left to hit.
create function public.raid_strike() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  w raid_weeks := raid_week_row();
  v_power int;
  v_dmg int;
begin
  perform pg_advisory_xact_lock(hashtextextended('raid:' || w.week::text, 3));
  select coalesce(sum(damage), 0) into v_dmg from raid_strikes where week = w.week;
  if v_dmg >= w.max_hp then return jsonb_build_object('ok', false, 'reason', 'defeated'); end if;
  if exists (select 1 from raid_strikes where hero_id = me and day = school_date(now())) then
    return jsonb_build_object('ok', false, 'reason', 'already_struck');
  end if;
  v_power := raid_power(me);
  insert into raid_strikes (hero_id, day, week, damage) values (me, school_date(now()), w.week, v_power);
  return jsonb_build_object('ok', true, 'damage', v_power, 'defeated', v_dmg + v_power >= w.max_hp);
end $$;

-- Heroes who struck collect once when the boss is down.
create function public.raid_claim() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  w raid_weeks := raid_week_row();
  v_cfg jsonb := setting('raid');
begin
  if (select coalesce(sum(damage), 0) from raid_strikes where week = w.week) < w.max_hp then
    return jsonb_build_object('ok', false, 'reason', 'not_defeated');
  end if;
  if not exists (select 1 from raid_strikes where hero_id = me and week = w.week) then
    return jsonb_build_object('ok', false, 'reason', 'did_not_strike');
  end if;
  perform award(me, 'xp', (v_cfg->>'xp')::int, 'event', 'Boss raid', 'raid:' || w.week);
  return jsonb_build_object('ok', true) || award(me, 'coins', (v_cfg->>'coins')::int, 'event', 'Boss raid', 'raid:' || w.week);
end $$;

revoke execute on function public.raid_week_row(), public.raid_power(uuid) from public, anon, authenticated;
revoke execute on function public.raid_state(), public.raid_strike(), public.raid_claim() from public, anon;
grant execute on function public.raid_state(), public.raid_strike(), public.raid_claim() to authenticated;
