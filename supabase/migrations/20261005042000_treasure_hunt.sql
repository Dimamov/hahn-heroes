-- Treasure hunt: each week has a map of 4 clues. Each clue points at a screen in the app, and the hero
-- taps a small map pin hidden there. Finding the clues in order pays a few diamonds each, and the whole
-- map pays a card. The clue text lives in the app; the server only knows the places and the prize.
create table public.treasure_progress (
  week date not null,
  hero_id uuid not null references public.heroes (id) on delete cascade,
  step int not null default 0 check (step between 0 and 4),
  claimed boolean not null default false,
  primary key (week, hero_id)
);
alter table public.treasure_progress enable row level security;
revoke all on public.treasure_progress from anon, authenticated;

create function public.treasure_def(p_week date) returns jsonb
language sql immutable set search_path = public as $$
  select (array[
    '{"places":["quest","room","cards","nexlings"],"card":"r-portal"}',
    '{"places":["learn","hero","squad","arcade"],"card":"r-crystal"}',
    '{"places":["profile","comics","stickers","badges"],"card":"r-luna"}',
    '{"places":["cards","arcade","room","learn"],"card":"r-kacee"}'
  ]::jsonb[])[1 + ((p_week - date '2026-01-05') / 7) % 4]
  || jsonb_build_object('hunt', ((p_week - date '2026-01-05') / 7) % 4)
$$;

create function public.treasure_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_week date := school_week(now());
  d jsonb := treasure_def(v_week);
  p treasure_progress;
begin
  select * into p from treasure_progress where week = v_week and hero_id = me;
  return jsonb_build_object('hunt', d->'hunt', 'step', coalesce(p.step, 0), 'steps', 4, 'done', coalesce(p.step, 0) >= 4,
    'claimed', coalesce(p.claimed, false), 'card', d->>'card');
end $$;

create function public.treasure_find(p_place text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_week date := school_week(now());
  d jsonb := treasure_def(v_week);
  v_step int;
begin
  insert into treasure_progress (week, hero_id) values (v_week, me) on conflict do nothing;
  select step into v_step from treasure_progress where week = v_week and hero_id = me for update;
  if v_step >= 4 or d->'places'->>v_step is distinct from p_place then
    return jsonb_build_object('ok', false);
  end if;
  update treasure_progress set step = v_step + 1 where week = v_week and hero_id = me;
  perform award(me, 'coins', 2, 'event', 'Treasure hunt clue', 'treasure:' || v_week || ':' || v_step);
  return jsonb_build_object('ok', true, 'step', v_step + 1, 'done', v_step + 1 >= 4);
end $$;

create function public.treasure_claim() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_week date := school_week(now());
  d jsonb := treasure_def(v_week);
  p treasure_progress;
begin
  select * into p from treasure_progress where week = v_week and hero_id = me for update;
  if p.week is null or p.step < 4 or p.claimed then return jsonb_build_object('ok', false); end if;
  update treasure_progress set claimed = true where week = v_week and hero_id = me;
  insert into hero_cards (hero_id, card_id, qty) values (me, d->>'card', 1)
  on conflict (hero_id, card_id) do update set qty = hero_cards.qty + 1;
  return jsonb_build_object('ok', true, 'card', d->>'card');
end $$;

revoke execute on function public.treasure_def(date) from public, anon, authenticated;
revoke execute on function public.treasure_state(), public.treasure_find(text), public.treasure_claim() from public, anon;
grant execute on function public.treasure_state(), public.treasure_find(text), public.treasure_claim() to authenticated;
