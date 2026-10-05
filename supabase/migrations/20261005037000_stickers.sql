-- Stickers: a hero makes stickers from hero art, a colour, a frame, a decoration and a word from a
-- fixed list (no free text), then can give them to squad mates. Making one costs 10 points.
create table public.stickers (
  id bigint generated always as identity primary key,
  maker uuid not null references public.heroes (id) on delete cascade,
  owner uuid not null references public.heroes (id) on delete cascade,
  hero text not null check (hero in ('ana','isabella','anayah','luna','kacee','g06','g07','g08','g09','g10','b01','b02','b03','b04','b05','b06','b07','b08','b09','b10')),
  bg text not null check (bg in ('violet', 'pink', 'cyan', 'gold', 'mint', 'sunset')),
  frame text not null check (frame in ('plain', 'star', 'dots', 'neon')),
  deco text not null check (deco in ('⭐', '💎', '🔥', '🌈', '🎮', '🏆', '🐾', '🦄', '🚀', '🎵')),
  word text not null check (word in ('Hero!', 'Team Nexus', 'Brave', 'Awesome', 'Level up!', 'Best squad', 'Go go go', 'Cool', 'Nexus fan', 'Never give up')),
  created_at timestamptz not null default now()
);
create index stickers_owner_idx on public.stickers (owner);
create index stickers_maker_day_idx on public.stickers (maker, created_at);
alter table public.stickers enable row level security;
revoke all on public.stickers from anon, authenticated;

create function public.sticker_json(s stickers) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('id', s.id, 'hero', s.hero, 'bg', s.bg, 'frame', s.frame, 'deco', s.deco, 'word', s.word)
$$;

create function public.sticker_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  return jsonb_build_object(
    'stickers', coalesce((select jsonb_agg(sticker_json(s) order by s.id desc) from stickers s where s.owner = me), '[]'::jsonb),
    'made_today', (select count(*) from stickers where maker = me and school_date(created_at) = school_date(now())),
    'cost', 10, 'daily_limit', 3, 'max_owned', 30);
end $$;

create function public.sticker_make(p_hero text, p_bg text, p_frame text, p_deco text, p_word text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_id bigint;
  r jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(me::text, 11));
  if (select count(*) from stickers where maker = me and school_date(created_at) = school_date(now())) >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit');
  end if;
  if (select count(*) from stickers where owner = me) >= 30 then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;
  insert into stickers (maker, owner, hero, bg, frame, deco, word) values (me, me, p_hero, p_bg, p_frame, p_deco, p_word) returning id into v_id;
  r := spend(me, 10, 'sticker:' || v_id, 'sticker:' || v_id);
  if not (r->>'ok')::boolean then raise exception 'not enough points'; end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'balance', r->'balance');
end $$;

-- Give a sticker to someone in your squad.
create function public.sticker_give(p_sticker bigint, p_to uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  if p_to = me then raise exception 'pick a squad mate'; end if;
  if not exists (
    select 1 from squad_members a join squad_members b on b.squad_id = a.squad_id join squads s on s.id = a.squad_id
     where a.child_id = me and a.status = 'member' and b.child_id = p_to and b.status = 'member' and s.disbanded_at is null
  ) then raise exception 'you can only give stickers to your squad'; end if;
  if (select count(*) from stickers where owner = p_to) >= 30 then return jsonb_build_object('ok', false, 'reason', 'full'); end if;
  update stickers set owner = p_to where id = p_sticker and owner = me;
  if not found then raise exception 'that is not your sticker'; end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.sticker_json(stickers) from public, anon, authenticated;
revoke execute on function public.sticker_list(), public.sticker_make(text, text, text, text, text), public.sticker_give(bigint, uuid) from public, anon;
grant execute on function public.sticker_list(), public.sticker_make(text, text, text, text, text), public.sticker_give(bigint, uuid) to authenticated;
