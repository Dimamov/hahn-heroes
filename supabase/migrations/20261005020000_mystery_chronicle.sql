-- Mystery Lab cases and Chronicle Quest: question steps checked on the server, one reward per step,
-- one prize per case. Case text is in the app; answers and rewards are here.
create table public.adv_cases (
  case_id text primary key,
  kind text not null check (kind in ('lab', 'chronicle')),
  steps int not null,
  coins int not null,
  card text not null references public.card_defs (id)
);
create table public.adv_keys (
  case_id text not null references public.adv_cases (case_id),
  step_id text not null,
  ord int not null,
  choices int not null,
  answer int not null,
  explanation text not null,
  primary key (case_id, step_id)
);
create table public.adv_solved (
  hero_id uuid not null references public.heroes (id) on delete cascade,
  case_id text not null,
  step_id text not null,
  primary key (hero_id, case_id, step_id)
);
create table public.adv_done (
  hero_id uuid not null references public.heroes (id) on delete cascade,
  case_id text not null,
  done_at timestamptz not null default now(),
  primary key (hero_id, case_id)
);
alter table public.adv_cases enable row level security;
alter table public.adv_keys enable row level security;
alter table public.adv_solved enable row level security;
alter table public.adv_done enable row level security;
revoke all on public.adv_cases, public.adv_keys, public.adv_solved, public.adv_done from anon, authenticated;

insert into public.adv_cases (case_id, kind, steps, coins, card) values
  ('lab1', 'lab', 3, 15, 'u-key'),
  ('lab2', 'lab', 3, 15, 'u-cloak'),
  ('chron1', 'chronicle', 5, 30, 'r-crystal');
insert into public.adv_keys (case_id, step_id, ord, choices, answer, explanation) values
  ('lab1', 'q1', 1, 3, 1, 'The empty box had a sticky blue smear, and the only blue ink in the hall was on the art room door handle.'),
  ('lab1', 'q2', 2, 3, 0, 'The note said the crystals vanished after the 2 o''clock bell. Anyone in math class then could not have taken them.'),
  ('lab1', 'q3', 3, 3, 2, '12 crystals in each of 4 boxes is 48. Only 45 were found, so 3 crystals are still missing.'),
  ('lab2', 'q1', 1, 3, 2, 'A bell that rings quietly could be stuffed with something soft. Cotton was found inside it.'),
  ('lab2', 'q2', 2, 3, 1, 'The bell rings every 45 minutes. 8:00, 8:45, 9:30, so the next one after 9:30 is 10:15.'),
  ('lab2', 'q3', 3, 3, 0, 'The cotton fluff matched the janitor''s cleaning rags, so the rag closet is where the hunt ends.'),
  ('chron1', 's1', 1, 3, 1, 'Founders build a place first. The academy was founded when the first doors opened.'),
  ('chron1', 's2', 2, 3, 0, 'A symbol that glows is a sign of energy. The emblem was made of crystal light.'),
  ('chron1', 's3', 3, 3, 2, 'The Keeper''s wolves guard the gates, so wolves are the protectors in the story.'),
  ('chron1', 's4', 4, 3, 1, '7 doors and each door has 3 locks: 7 times 3 is 21 locks.'),
  ('chron1', 's5', 5, 3, 0, 'Learning, kindness and effort keep the Nexus strong.');

create function public.adv_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'case', c.case_id, 'kind', c.kind,
      'solved', coalesce((select jsonb_agg(s.step_id) from adv_solved s where s.hero_id = me and s.case_id = c.case_id), '[]'::jsonb),
      'done', exists (select 1 from adv_done d where d.hero_id = me and d.case_id = c.case_id))
    order by c.case_id) from adv_cases c), '[]'::jsonb);
end $$;

create function public.adv_answer(p_case text, p_step text, p_choice int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  k adv_keys;
  c adv_cases;
  v_first boolean;
begin
  select * into k from adv_keys where case_id = p_case and step_id = p_step;
  if k.case_id is null then raise exception 'no such step'; end if;
  select * into c from adv_cases where case_id = p_case;
  if p_choice is null or p_choice not between 0 and k.choices - 1 then raise exception 'pick one of the choices'; end if;
  -- the Chronicle trail opens one step at a time
  if c.kind = 'chronicle' and k.ord > 1 and not exists (
    select 1 from adv_solved s join adv_keys pk on pk.case_id = s.case_id and pk.step_id = s.step_id
     where s.hero_id = me and s.case_id = p_case and pk.ord = k.ord - 1) then
    raise exception 'that clue is still sealed';
  end if;
  if p_choice <> k.answer then return jsonb_build_object('correct', false); end if;
  insert into adv_solved (hero_id, case_id, step_id) values (me, p_case, p_step) on conflict do nothing;
  v_first := found;
  if v_first then
    perform award(me, 'coins', 5, 'event', 'Mystery or Chronicle step', 'adv:' || p_case || ':' || p_step);
    perform award(me, 'xp', 5, 'event', 'Mystery or Chronicle step', 'adv:' || p_case || ':' || p_step);
  end if;
  return jsonb_build_object('correct', true, 'right_choice', k.answer, 'explanation', k.explanation, 'first', v_first);
end $$;

create function public.adv_complete(p_case text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  c adv_cases;
begin
  select * into c from adv_cases where case_id = p_case;
  if c.case_id is null then raise exception 'no such case'; end if;
  if (select count(*) from adv_solved where hero_id = me and case_id = p_case) < c.steps then
    raise exception 'answer every question first';
  end if;
  insert into adv_done (hero_id, case_id) values (me, p_case) on conflict do nothing;
  if not found then return jsonb_build_object('repeat', true, 'card', c.card); end if;
  perform award(me, 'coins', c.coins, 'event', 'Solved ' || p_case, 'adv:' || p_case || ':done');
  insert into hero_cards (hero_id, card_id, qty) values (me, c.card, 1)
  on conflict (hero_id, card_id) do update set qty = hero_cards.qty + 1;
  return jsonb_build_object('repeat', false, 'card', c.card, 'coins', c.coins);
end $$;

revoke execute on function public.adv_state(), public.adv_answer(text, text, int), public.adv_complete(text) from public, anon;
grant execute on function public.adv_state(), public.adv_answer(text, text, int), public.adv_complete(text) to authenticated;
