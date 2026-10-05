-- Story: saved reading progress, choices that change rewards (not the story), quiz checkpoints and a
-- completion card. The story text lives in the app; the answers and rewards live here.
create table public.story_progress (
  hero_id uuid not null references public.heroes (id) on delete cascade,
  episode text not null,
  panel int not null default 0 check (panel between 0 and 200),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (hero_id, episode)
);
create table public.story_choices (
  hero_id uuid not null references public.heroes (id) on delete cascade,
  episode text not null,
  panel_id text not null,
  option_id text not null,
  primary key (hero_id, episode, panel_id)
);
create table public.story_solved (
  hero_id uuid not null references public.heroes (id) on delete cascade,
  episode text not null,
  checkpoint text not null,
  primary key (hero_id, episode, checkpoint)
);
create table public.story_keys (
  episode text not null,
  checkpoint text not null,
  choices int not null,
  answer int not null,
  explanation text not null,
  primary key (episode, checkpoint)
);
create table public.story_choice_rewards (
  episode text not null,
  panel_id text not null,
  option_id text not null,
  currency public.reward_currency not null,
  amount int not null check (amount > 0),
  primary key (episode, panel_id, option_id)
);
create table public.story_episodes (
  episode text primary key,
  checkpoints int not null,
  coins int not null,
  card text not null references public.card_defs (id)
);
alter table public.story_progress enable row level security;
alter table public.story_choices enable row level security;
alter table public.story_solved enable row level security;
alter table public.story_keys enable row level security;
alter table public.story_choice_rewards enable row level security;
alter table public.story_episodes enable row level security;
revoke all on public.story_progress, public.story_choices, public.story_solved, public.story_keys,
  public.story_choice_rewards, public.story_episodes from anon, authenticated;

insert into public.story_episodes (episode, checkpoints, coins, card) values ('ep1', 3, 20, 'e-keeper');
insert into public.story_keys (episode, checkpoint, choices, answer, explanation) values
  ('ep1', 'cp1', 3, 1, '5 heroes times 12 crystals is 60 crystals.'),
  ('ep1', 'cp2', 3, 0, 'A keeper looks after something and keeps it safe.'),
  ('ep1', 'cp3', 3, 2, 'Reflection is light bouncing off a surface, like a mirror or a crystal.');
insert into public.story_choice_rewards (episode, panel_id, option_id, currency, amount) values
  ('ep1', 'touch', 'ana', 'coins', 5),
  ('ep1', 'touch', 'isabella', 'xp', 5),
  ('ep1', 'touch', 'together', 'skill_points', 1);

create function public.story_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'episode', e.episode,
      'panel', coalesce(p.panel, 0),
      'completed', p.completed_at is not null,
      'choices', coalesce((select jsonb_object_agg(c.panel_id, c.option_id) from story_choices c where c.hero_id = me and c.episode = e.episode), '{}'::jsonb),
      'solved', coalesce((select jsonb_agg(s.checkpoint) from story_solved s where s.hero_id = me and s.episode = e.episode), '[]'::jsonb))
    order by e.episode)
    from story_episodes e left join story_progress p on p.hero_id = me and p.episode = e.episode), '[]'::jsonb);
end $$;

-- Remember how far the reader got; it only moves forward.
create function public.story_save(p_episode text, p_panel int) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  if not exists (select 1 from story_episodes where episode = p_episode) then raise exception 'no such episode'; end if;
  insert into story_progress (hero_id, episode, panel) values (me, p_episode, least(greatest(p_panel, 0), 200))
  on conflict (hero_id, episode) do update set panel = greatest(story_progress.panel, excluded.panel), updated_at = now();
end $$;

-- A choice changes the reward, never the story. Only the first pick counts.
create function public.story_choose(p_episode text, p_panel text, p_option text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  r story_choice_rewards;
begin
  select * into r from story_choice_rewards where episode = p_episode and panel_id = p_panel and option_id = p_option;
  if r.episode is null then raise exception 'no such choice'; end if;
  insert into story_choices (hero_id, episode, panel_id, option_id) values (me, p_episode, p_panel, p_option)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('repeat', true, 'option', (select option_id from story_choices where hero_id = me and episode = p_episode and panel_id = p_panel));
  end if;
  perform award(me, r.currency, r.amount, 'event', 'Story choice', 'story:' || p_episode || ':' || p_panel);
  return jsonb_build_object('repeat', false, 'option', p_option, 'currency', r.currency, 'amount', r.amount);
end $$;

create function public.story_answer(p_episode text, p_checkpoint text, p_choice int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  k story_keys;
  v_first boolean := false;
begin
  select * into k from story_keys where episode = p_episode and checkpoint = p_checkpoint;
  if k.episode is null then raise exception 'no such checkpoint'; end if;
  if p_choice is null or p_choice not between 0 and k.choices - 1 then raise exception 'pick one of the choices'; end if;
  if p_choice <> k.answer then
    return jsonb_build_object('correct', false);
  end if;
  insert into story_solved (hero_id, episode, checkpoint) values (me, p_episode, p_checkpoint) on conflict do nothing;
  v_first := found;
  if v_first then
    perform award(me, 'coins', 5, 'event', 'Story checkpoint', 'story:' || p_episode || ':' || p_checkpoint);
    perform award(me, 'xp', 5, 'event', 'Story checkpoint', 'story:' || p_episode || ':' || p_checkpoint);
  end if;
  return jsonb_build_object('correct', true, 'right_choice', k.answer, 'explanation', k.explanation, 'first', v_first);
end $$;

-- Finishing needs every checkpoint solved. The coins and the card arrive once.
create function public.story_complete(p_episode text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  e story_episodes;
begin
  select * into e from story_episodes where episode = p_episode;
  if e.episode is null then raise exception 'no such episode'; end if;
  if (select count(*) from story_solved where hero_id = me and episode = p_episode) < e.checkpoints then
    raise exception 'answer every checkpoint first';
  end if;
  insert into story_progress (hero_id, episode, panel, completed_at) values (me, p_episode, 200, now())
  on conflict (hero_id, episode) do update set completed_at = coalesce(story_progress.completed_at, now()), panel = 200, updated_at = now()
  where story_progress.completed_at is null;
  if not found then return jsonb_build_object('repeat', true, 'card', e.card); end if;
  perform award(me, 'coins', e.coins, 'event', 'Finished ' || p_episode, 'story:' || p_episode || ':done');
  insert into hero_cards (hero_id, card_id, qty) values (me, e.card, 1)
  on conflict (hero_id, card_id) do update set qty = hero_cards.qty + 1;
  return jsonb_build_object('repeat', false, 'card', e.card, 'coins', e.coins);
end $$;

revoke execute on function public.story_state(), public.story_save(text, int), public.story_choose(text, text, text),
  public.story_answer(text, text, int), public.story_complete(text) from public, anon;
grant execute on function public.story_state(), public.story_save(text, int), public.story_choose(text, text, text),
  public.story_answer(text, text, int), public.story_complete(text) to authenticated;
