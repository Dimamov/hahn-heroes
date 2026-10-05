-- Skill trees and Nexus Surge. Skill points (earned 1 per right Learn answer) buy skills; XP and coins are untouched.
-- Surge: a streak of right Learn answers switches on a timed coin boost for Learn answers only.
-- It never changes House points, which count right answers, not coins.
create table public.skills (
  id text primary key,
  tree text not null check (tree in ('scholar', 'explorer', 'guardian')),
  tier int not null check (tier between 1 and 3),
  name text not null,
  icon text not null,
  cost int not null check (cost > 0),
  blurb text not null,
  unique (tree, tier)
);
insert into public.skills (id, tree, tier, name, icon, cost, blurb) values
  ('sc1', 'scholar', 1, 'Quick Study', '📘', 2, 'Nexus Surge starts after 4 right answers in a row instead of 5.'),
  ('sc2', 'scholar', 2, 'Deep Focus', '🔍', 4, 'Nexus Surge lasts 15 minutes instead of 10.'),
  ('sc3', 'scholar', 3, 'Brain Blaze', '🧠', 6, 'Nexus Surge pays double instead of one and a half times.'),
  ('ex1', 'explorer', 1, 'Early Bird', '🌅', 2, '3 extra points on the daily check-in.'),
  ('ex2', 'explorer', 2, 'Treasure Sense', '🧭', 4, '1 extra point for every right Learn answer.'),
  ('ex3', 'explorer', 3, 'Lucky Day', '🍀', 6, '5 more extra points on the daily check-in.'),
  ('gd1', 'guardian', 1, 'Team Spirit', '🤝', 2, 'Your Nexling grows 10% faster.'),
  ('gd2', 'guardian', 2, 'Nexus Bond', '💞', 4, 'Your Nexling''s favourite play grows it 2 times instead of 1.5 times.'),
  ('gd3', 'guardian', 3, 'Guardian Aura', '🛡️', 6, 'Your Nexling grows 25% faster instead of 10%.');

create table public.hero_skills (
  hero_id uuid not null references public.heroes (id) on delete cascade,
  skill_id text not null references public.skills (id),
  learned_at timestamptz not null default now(),
  primary key (hero_id, skill_id)
);
create table public.hero_surge (
  hero_id uuid primary key references public.heroes (id) on delete cascade,
  streak int not null default 0,
  surge_until timestamptz
);
alter table public.skills enable row level security;
alter table public.hero_skills enable row level security;
alter table public.hero_surge enable row level security;
revoke all on public.skills, public.hero_skills, public.hero_surge from anon, authenticated;

create function public.has_skill(p_hero uuid, p_skill text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from hero_skills where hero_id = p_hero and skill_id = p_skill)
$$;

create function public.surge_rules(p_hero uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'need', case when has_skill(p_hero, 'sc1') then 4 else 5 end,
    'minutes', case when has_skill(p_hero, 'sc2') then 15 else 10 end,
    'mult', case when has_skill(p_hero, 'sc3') then 2.0 else 1.5 end)
$$;

create function public.surge_view(p_hero uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'active', coalesce(s.surge_until > now(), false),
    'seconds_left', greatest(0, coalesce(ceil(extract(epoch from s.surge_until - now())), 0))::int,
    'streak', coalesce(s.streak, 0),
    'need', (surge_rules(p_hero) ->> 'need')::int,
    'mult', (surge_rules(p_hero) ->> 'mult')::numeric)
  from (select 1) x left join hero_surge s on s.hero_id = p_hero
$$;

create function public.skill_balance(p_hero uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::int from ledger_entries where child_id = p_hero and currency = 'skill_points'
$$;

create function public.skill_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  return jsonb_build_object(
    'points', skill_balance(me),
    'surge', surge_view(me),
    'skills', (select jsonb_agg(jsonb_build_object('id', s.id, 'tree', s.tree, 'tier', s.tier, 'name', s.name, 'icon', s.icon,
                  'cost', s.cost, 'blurb', s.blurb,
                  'learned', has_skill(me, s.id),
                  'ready', s.tier = 1 or has_skill(me, (select p.id from skills p where p.tree = s.tree and p.tier = s.tier - 1))) order by s.tree, s.tier)
                from skills s));
end $$;

create function public.skill_learn(p_skill text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  s skills;
begin
  select * into s from skills where id = p_skill;
  if s.id is null then raise exception 'no such skill'; end if;
  perform pg_advisory_xact_lock(hashtextextended(me::text, 8));
  if has_skill(me, s.id) then return jsonb_build_object('ok', false, 'reason', 'already_learned'); end if;
  if s.tier > 1 and not has_skill(me, (select p.id from skills p where p.tree = s.tree and p.tier = s.tier - 1)) then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;
  if skill_balance(me) < s.cost then return jsonb_build_object('ok', false, 'reason', 'not_enough_points'); end if;
  insert into ledger_entries (child_id, currency, amount, requested, source, reason, idempotency_key, school_week)
  values (me, 'skill_points', -s.cost, s.cost, 'purchase', 'Skill: ' || s.name, 'skill:' || s.id, school_week(now()));
  insert into hero_skills (hero_id, skill_id) values (me, s.id);
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.has_skill(uuid, text), public.surge_rules(uuid), public.surge_view(uuid), public.skill_balance(uuid) from public, anon, authenticated;
revoke execute on function public.skill_state(), public.skill_learn(text) from public, anon;
grant execute on function public.skill_state(), public.skill_learn(text) to authenticated;
-- Skills change the rules in three existing places: Learn answers (Surge and Treasure Sense),
-- the daily check-in (Early Bird, Lucky Day) and Nexling growth (Guardian skills).
create or replace function public.answer_question(p_question text, p_choice int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_child uuid := auth.uid();
  v_hist question_history;
  v_q questions;
  v_key question_keys;
  v_cfg jsonb := setting('learning_rewards');
  v_rules jsonb := surge_rules(auth.uid());
  v_right boolean;
  v_coins jsonb;
  v_base int;
  v_surging boolean := false;
  v_started boolean := false;
  v_state hero_surge;
  v_awarded jsonb := '{}'::jsonb;
begin
  select * into v_hist from question_history where child_id = v_child and question_id = p_question for update;
  if not found then raise exception 'that question was not handed to you'; end if;
  select * into v_q from questions where id = p_question;
  select * into v_key from question_keys where question_id = p_question;

  if v_hist.answered_at is not null then
    return jsonb_build_object('correct', v_hist.correct, 'right_choice', v_key.answer,
                              'explanation', v_key.explanation, 'repeat', true, 'surge', surge_view(v_child));
  end if;
  if p_choice is null or p_choice not between 0 and jsonb_array_length(v_q.choices) - 1 then
    raise exception 'pick one of the choices';
  end if;

  v_right := p_choice = v_key.answer;
  update question_history set answered_at = now(), correct = v_right where child_id = v_child and question_id = p_question;
  insert into skill_stats (child_id, subject, skill, attempts, correct)
  values (v_child, v_q.subject, v_q.skill, 1, case when v_right then 1 else 0 end)
  on conflict (child_id, subject, skill) do update
    set attempts = skill_stats.attempts + 1, correct = skill_stats.correct + excluded.correct, updated_at = now();

  insert into hero_surge (hero_id) values (v_child) on conflict (hero_id) do nothing;
  select * into v_state from hero_surge where hero_id = v_child for update;
  v_surging := coalesce(v_state.surge_until > now(), false);

  if v_right then
    v_base := (v_cfg ->> 'coins')::int + case when has_skill(v_child, 'ex2') then 1 else 0 end;
    if v_surging then v_base := round(v_base * (v_rules ->> 'mult')::numeric)::int; end if;
    v_coins := award(v_child, 'coins', v_base, 'learning', 'Practice: ' || v_q.skill, 'learn:' || p_question);
    perform award(v_child, 'xp', (v_cfg ->> 'xp')::int, 'learning', 'Practice: ' || v_q.skill, 'learn:' || p_question);
    perform award(v_child, 'skill_points', (v_cfg ->> 'skill_points')::int, 'learning', 'Practice: ' || v_q.skill, 'learn:' || p_question);
    v_awarded := jsonb_build_object('coins', v_coins ->> 'awarded', 'xp', (v_cfg ->> 'xp')::int,
                                    'skill_points', (v_cfg ->> 'skill_points')::int, 'capped', (v_coins ->> 'capped')::boolean);
    if not v_surging and v_state.streak + 1 >= (v_rules ->> 'need')::int then
      update hero_surge set streak = 0, surge_until = now() + make_interval(mins => (v_rules ->> 'minutes')::int) where hero_id = v_child;
      v_started := true;
    else
      update hero_surge set streak = case when v_surging then 0 else v_state.streak + 1 end where hero_id = v_child;
    end if;
  else
    update hero_surge set streak = 0 where hero_id = v_child;
  end if;

  return jsonb_build_object('correct', v_right, 'right_choice', v_key.answer, 'explanation', v_key.explanation,
                            'repeat', false, 'awarded', v_awarded, 'surge', surge_view(v_child) || jsonb_build_object('started', v_started));
end $$;

create or replace function public.daily_reward_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_child uuid := auth.uid();
  v_amount int;
begin
  if v_child is null then raise exception 'not signed in'; end if;
  v_amount := (setting('daily_login_coins') #>> '{}')::int + case when has_skill(v_child, 'ex1') then 3 else 0 end + case when has_skill(v_child, 'ex3') then 5 else 0 end;
  return jsonb_build_object(
    'available', not exists (
      select 1 from ledger_entries
       where child_id = v_child and currency = 'coins' and idempotency_key = 'daily:' || school_date(now())),
    'amount', v_amount);
end $$;

create or replace function public.claim_daily_reward() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_child uuid := auth.uid();
begin
  if v_child is null or not exists (select 1 from heroes where id = v_child) then
    raise exception 'not signed in';
  end if;
  return award(v_child, 'coins',
               (setting('daily_login_coins') #>> '{}')::int + case when has_skill(v_child, 'ex1') then 3 else 0 end + case when has_skill(v_child, 'ex3') then 5 else 0 end,
               'daily', 'Daily Nexus check-in', 'daily:' || school_date(now()));
end $$;

create or replace function public.nexling_growth(p_hero uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(floor(sum(case when l.source = t.bonus_source then l.amount * (case when has_skill(p_hero, 'gd2') then 2.0 else 1.5 end) else l.amount end)
                        * (case when has_skill(p_hero, 'gd3') then 1.25 when has_skill(p_hero, 'gd1') then 1.1 else 1 end)), 0)::int
    from nexlings n
    join nexling_types t on t.id = n.type_id
    join ledger_entries l on l.child_id = n.hero_id and l.currency = 'coins' and l.amount > 0 and l.created_at >= n.adopted_at
   where n.hero_id = p_hero
$$;
