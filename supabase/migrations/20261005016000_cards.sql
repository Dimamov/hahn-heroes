-- Collections, part 4: cards, packs and fair trading.
-- Packs are earned from verified results only (right Learn answers, approved home missions, passed class missions),
-- so there is nothing to farm. Trades move both sides in one step after both children confirm the same exact offer.
create type public.card_rarity as enum ('common', 'uncommon', 'rare', 'epic', 'legendary');
create table public.card_defs (
  id text primary key,
  name text not null,
  rarity public.card_rarity not null,
  icon text not null,
  flavor text not null
);
insert into public.card_defs (id, name, rarity, icon, flavor) values
  ('c-hall','Hahn Front Hall','common','🏫','Where every hero first steps into the Nexus.'),
  ('c-locker','Lucky Locker','common','🔐','It always opens on the first try. Almost.'),
  ('c-pencil','Power Pencil','common','✏️','Sharpened by a thousand good ideas.'),
  ('c-notebook','Quest Notebook','common','📓','Every great quest starts on page one.'),
  ('c-lunch','Hero Lunch','common','🥪','Snack power restored.'),
  ('c-bell','Nexus Bell','common','🔔','Rings when something awesome is about to happen.'),
  ('c-backpack','Magic Backpack','common','🎒','Holds more than it should.'),
  ('c-clock','Time Clock','common','⏰','Never late, never early.'),
  ('c-map','Academy Map','common','🗺️','Some rooms are only on the secret side.'),
  ('c-lamp','Study Lamp','common','💡','Glows brighter with every right answer.'),
  ('c-book','Dusty Tome','common','📖','The pages turn on their own.'),
  ('c-compass','Lost Compass','common','🧭','Points to whatever you need most.'),
  ('c-sneakers','Sprint Sneakers','common','👟','Hallway speed record holder.'),
  ('c-calc','Crystal Calculator','common','🧮','Adds up to adventure.'),
  ('c-globe','Wonder Globe','common','🌍','Spin it and pick a mystery.'),
  ('c-flask','Bubbly Flask','common','🧪','Do not shake. Okay, shake a little.'),
  ('c-trophy','Tiny Trophy','common','🏆','Small, shiny and well earned.'),
  ('c-star','Wish Star','common','⭐','Make a wish for a friend.'),
  ('u-ember','Emberling Egg','uncommon','🥚','Warm to the touch, and humming.'),
  ('u-gale','Zephling Breeze','uncommon','🌬️','Carries giggles across the playground.'),
  ('u-tide','Tideling Splash','uncommon','💧','Calm on top, deep underneath.'),
  ('u-moss','Mossling Sprout','uncommon','🌱','Grows when you help someone.'),
  ('u-frost','Frostling Flake','uncommon','❄️','Every one is different. Just like you.'),
  ('u-spark','Sparkling Zap','uncommon','⚡','Quick as a good idea.'),
  ('u-glim','Glimmerling Gleam','uncommon','✨','Shines brightest at big moments.'),
  ('u-owl','Library Owl','uncommon','🦉','Knows where every book is hiding.'),
  ('u-wolf','Gray Wolf Pup','uncommon','🐺','A guardian in training.'),
  ('u-bridge','Rainbow Bridge','uncommon','🌈','Connects two worlds and two friends.'),
  ('u-cloak','Storm Cloak','uncommon','🧣','Weathers any pop quiz.'),
  ('u-key','Silver Key','uncommon','🗝️','Fits a door nobody has found yet.'),
  ('r-isabella','Isabella, Swift Scout','rare','🏃‍♀️','First to every clue, last to give up.'),
  ('r-anayah','Anayah, Kind Heart','rare','💖','Her kindness is her strongest power.'),
  ('r-luna','Luna, Moon Mage','rare','🌙','Her spells glow in the dark.'),
  ('r-kacee','Kacee, Bright Spark','rare','🔥','Turns a bad day into a good plan.'),
  ('r-portal','The Nexus Portal','rare','🌀','A swirl of violet light and possibility.'),
  ('r-crystal','Violet Crystal','rare','🔮','Hums when a hero is near.'),
  ('e-ana','Ana, Hero of the Nexus','epic','🦸‍♀️','She touched the symbol and the world woke up.'),
  ('e-keeper','The First Keeper','epic','👑','Guardian of the academy, flanked by two gray wolves.'),
  ('e-squad','The Founding Squad','epic','🤝','Five friends. One Nexus. Endless adventures.'),
  ('l-sensei','The Sensei','legendary','🧙','Creator of the Nexus. He only appears to those who are ready.'),
  ('l-emblem','The H.A.H.N. Emblem','legendary','🛡️','Heroes Awakening: Hidden Nexus.');

create table public.hero_cards (
  hero_id uuid not null references public.heroes (id) on delete cascade,
  card_id text not null references public.card_defs (id),
  qty int not null check (qty >= 0),
  primary key (hero_id, card_id)
);
create table public.card_state (
  hero_id uuid primary key references public.heroes (id) on delete cascade,
  packs_opened int not null default 0,
  showcase jsonb not null default '[]'
);
create table public.card_trades (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references public.heroes (id) on delete cascade,   -- who started it
  b uuid not null references public.heroes (id) on delete cascade,
  offer_a jsonb not null default '[]',
  offer_b jsonb not null default '[]',
  ver int not null default 1,
  conf_a int not null default 0,
  conf_b int not null default 0,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  updated_at timestamptz not null default now(),
  check (a <> b)
);
create unique index card_trades_open_idx on public.card_trades (least(a, b), greatest(a, b)) where status = 'open';
alter table public.card_defs enable row level security;
alter table public.hero_cards enable row level security;
alter table public.card_state enable row level security;
alter table public.card_trades enable row level security;
revoke all on public.card_defs, public.hero_cards, public.card_state, public.card_trades from anon, authenticated;

create function public.rarity_value(r public.card_rarity) returns numeric
language sql immutable as $$
  select case r when 'common' then 1 when 'uncommon' then 3 when 'rare' then 8 when 'epic' then 20 else 50 end
$$;

create function public.packs_available(p_hero uuid) returns int
language sql stable security definer set search_path = public as $$
  select (1
    + (select count(*) from question_history where child_id = p_hero and correct) / 15
    + (select count(*) from home_missions where child_id = p_hero and status = 'approved')
    + (select count(*) from class_submissions where child_id = p_hero and score_pct >= 80))::int
    - coalesce((select packs_opened from card_state where hero_id = p_hero), 0)
$$;

create function public.cards_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  return jsonb_build_object(
    'packs', packs_available(me),
    'cards', coalesce((select jsonb_agg(jsonb_build_object('id', card_id, 'qty', qty) order by card_id) from hero_cards where hero_id = me and qty > 0), '[]'::jsonb),
    'showcase', coalesce((select showcase from card_state where hero_id = me), '[]'::jsonb),
    'total', (select count(*) from card_defs));
end $$;

-- Opens one pack: three cards. Packs hold common to epic; legendary cards only come from the Sensei.
create function public.card_open_pack() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_out jsonb := '[]';
  v_roll numeric;
  v_rarity public.card_rarity;
  v_card text;
  v_new boolean;
  i int;
begin
  perform pg_advisory_xact_lock(hashtextextended(me::text, 9));
  if packs_available(me) <= 0 then raise exception 'no packs to open'; end if;
  insert into card_state (hero_id, packs_opened) values (me, 1)
  on conflict (hero_id) do update set packs_opened = card_state.packs_opened + 1;
  for i in 1..3 loop
    v_roll := random() * 100;
    v_rarity := case when v_roll < 70 then 'common' when v_roll < 90 then 'uncommon' when v_roll < 98 then 'rare' else 'epic' end;
    select id into v_card from card_defs where rarity = v_rarity order by random() limit 1;
    v_new := not exists (select 1 from hero_cards where hero_id = me and card_id = v_card and qty > 0);
    insert into hero_cards (hero_id, card_id, qty) values (me, v_card, 1)
    on conflict (hero_id, card_id) do update set qty = hero_cards.qty + 1;
    v_out := v_out || jsonb_build_object('id', v_card, 'new', v_new);
  end loop;
  return jsonb_build_object('cards', v_out, 'packs', packs_available(me));
end $$;

create function public.card_set_showcase(p_cards jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  c text;
begin
  if jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) > 3 then raise exception 'pick up to 3 favourites'; end if;
  for c in select jsonb_array_elements_text(p_cards) loop
    if not exists (select 1 from hero_cards where hero_id = me and card_id = c and qty > 0) then raise exception 'you do not own that card'; end if;
  end loop;
  insert into card_state (hero_id, showcase) values (me, (select coalesce(jsonb_agg(distinct x), '[]') from jsonb_array_elements_text(p_cards) x))
  on conflict (hero_id) do update set showcase = excluded.showcase;
end $$;

-- The Sensei can hand any card to any hero, including the legendary ones.
create function public.sensei_give_card(p_hero_code text, p_card text) returns text
language plpgsql security definer set search_path = public as $$
declare h heroes;
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do that'; end if;
  select * into h from heroes where hero_code = upper(p_hero_code);
  if h.id is null then raise exception 'no hero has that code'; end if;
  if not exists (select 1 from card_defs where id = p_card) then raise exception 'no such card'; end if;
  insert into hero_cards (hero_id, card_id, qty) values (h.id, p_card, 1)
  on conflict (hero_id, card_id) do update set qty = hero_cards.qty + 1;
  return h.display_name;
end $$;
