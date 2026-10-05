-- Shadow Spy: the Shadow Signal game with emoji-only clues. A clue may now also be exactly one emoji
-- from a fixed palette of 24, so kids can play without typing a single word.
create function public.spy_emoji() returns text[]
language sql immutable set search_path = public as $$
  select array['🌞','🌙','⭐','🔥','💧','🌳','🍎','🍕','🐶','🐱','🐟','🦁','🚗','🏠','⚽','🎵','📚','🎨','🌈','🔑','👑','💎','🎁','🚀']
$$;

create or replace function public.shadow_clue(p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room uuid := shadow_room();
  g shadow_games;
  v_clue text := lower(trim(coalesce(p_text, '')));
  v_emoji boolean := v_clue = any (spy_emoji());
begin
  if v_room is null then raise exception 'you are not in a game'; end if;
  perform shadow_tick(v_room);
  select * into g from shadow_games where room_id = v_room;
  if g.phase <> 'clue' or (g.order_ids ->> g.turn)::uuid <> me then raise exception 'it is not your turn'; end if;
  if not v_emoji then
    if v_clue !~ '^[a-z][a-z''-]{0,15}$' then raise exception 'one word, letters only'; end if;
    if chat_flagged(v_clue) then raise exception 'pick a different word'; end if;
    if me <> g.shadow and position(replace(lower(g.word), ' ', '') in replace(v_clue, '-', '')) > 0 then raise exception 'that gives it away'; end if;
  end if;
  update shadow_games set clues = clues || jsonb_build_object('i', g.turn, 'text', v_clue), turn = turn + 1, phase_started_at = now()
   where room_id = v_room;
  perform shadow_tick(v_room);
end $$;
revoke execute on function public.spy_emoji() from public, anon, authenticated;
