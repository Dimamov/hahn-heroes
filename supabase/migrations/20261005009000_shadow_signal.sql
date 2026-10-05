-- Shadow Signal: a hidden-role clue-and-vote game for 3 to 6 heroes. Everyone but one player (the Shadow)
-- sees a secret word; the Shadow only sees its category. Each player gives a one word clue, then everyone
-- votes for who they think the Shadow is. If the Shadow is caught, they get one guess at the word.

alter table public.rooms drop constraint rooms_game_check;
alter table public.rooms add constraint rooms_game_check check (game in ('trivia-clash', 'odin', 'shadow-signal'));

create table public.shadow_words (
  category text not null,
  word text not null,
  primary key (category, word)
);
alter table public.shadow_words enable row level security;
revoke all on public.shadow_words from anon, authenticated;

insert into public.shadow_words (category, word)
select c, w from (values
 ('Animals', 'lion,penguin,dolphin,kangaroo,octopus,owl,panda,shark,eagle,turtle'),
 ('Food', 'pizza,tacos,pancakes,popcorn,sushi,spaghetti,cupcake,burger,pretzel,ice cream'),
 ('School', 'backpack,locker,cafeteria,recess,library,gym,school bus,homework,microscope,calculator'),
 ('Places', 'beach,volcano,castle,jungle,desert,museum,space station,playground,farm,mountain'),
 ('Sports', 'soccer,basketball,swimming,skateboarding,tennis,volleyball,baseball,gymnastics,karate,bowling'),
 ('Space', 'comet,galaxy,rocket,astronaut,moon,telescope,meteor,satellite,alien,black hole'),
 ('Jobs', 'chef,firefighter,pilot,teacher,doctor,farmer,artist,detective,mechanic,scientist'),
 ('Nature', 'rainbow,thunder,snowflake,tornado,waterfall,forest,river,sunrise,fog,hurricane'),
 ('Fun', 'chess,puzzle,trampoline,treasure map,magic trick,video game,roller coaster,kite,sandcastle,board game'),
 ('Fantasy', 'dragon,ninja,samurai,wizard,robot,unicorn,knight,fairy,giant,treasure'),
 ('Music', 'guitar,drums,piano,violin,trumpet,microphone,concert,choir,flute,headphones'),
 ('Home', 'pillow,blanket,refrigerator,bookshelf,bathtub,doorbell,sofa,lamp,window,staircase')
) t(c, ws), unnest(string_to_array(ws, ',')) w;

create table public.shadow_games (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  category text not null,
  word text not null,
  shadow uuid not null references public.heroes (id),
  order_ids jsonb not null,
  phase text not null default 'clue' check (phase in ('clue', 'vote', 'guess', 'done')),
  turn int not null default 0,
  phase_started_at timestamptz not null default now(),
  clues jsonb not null default '[]',
  votes jsonb not null default '{}',
  options jsonb not null default '[]',
  caught boolean,
  guess text,
  shadow_won boolean
);
alter table public.shadow_games enable row level security;
revoke all on public.shadow_games from anon, authenticated;

insert into public.app_settings (key, value) values
  ('shadow_rules', '{"clue_seconds": 30, "vote_seconds": 45, "guess_seconds": 30}') on conflict (key) do nothing;

-- Called by room_start for Shadow Signal rooms.
create function public.shadow_deal(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order jsonb;
  v_pick record;
  v_shadow uuid;
begin
  select jsonb_agg(child_id order by random()) into v_order from room_players where room_id = p_room and left_at is null;
  if jsonb_array_length(v_order) < 3 then raise exception 'you need at least 3 players'; end if;
  select category, word into v_pick from shadow_words order by random() limit 1;
  v_shadow := (v_order ->> floor(random() * jsonb_array_length(v_order))::int)::uuid;
  insert into shadow_games (room_id, category, word, shadow, order_ids, options)
  values (p_room, v_pick.category, v_pick.word, v_shadow, v_order,
          (select jsonb_agg(w order by random()) from (
             select word w from (select word from shadow_words where category = v_pick.category and word <> v_pick.word order by random() limit 7) a
             union all select v_pick.word) s));
end $$;

create function public.shadow_finish(p_room uuid, p_shadow_won boolean) returns void
language plpgsql security definer set search_path = public as $$
declare g shadow_games;
begin
  select * into g from shadow_games where room_id = p_room;
  update shadow_games set phase = 'done', shadow_won = p_shadow_won, phase_started_at = now() where room_id = p_room;
  update rooms set state = 'done' where id = p_room;
  update room_players set score = score + case when child_id = g.shadow then (case when p_shadow_won then 3 else 0 end)
                                               else (case when p_shadow_won then 0 else 2 end) end
   where room_id = p_room;
end $$;

-- Moves the game on when time is up or everyone has acted. Callers hold the game row lock.
create function public.shadow_tick(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  g shadow_games;
  v_rules jsonb := setting('shadow_rules');
  n int;
  v_active int;
  v_voted int;
  v_top int;
  v_shadow_idx int;
  v_shadow_votes int;
  v_most int;
begin
  select * into g from shadow_games where room_id = p_room for update;
  if g.phase = 'done' then return; end if;
  n := jsonb_array_length(g.order_ids);
  select count(*) into v_active from room_players where room_id = p_room and left_at is null;
  if v_active < 3 then
    if g.phase = 'done' then return; end if;
    perform shadow_finish(p_room, false);
    return;
  end if;
  loop
    exit when g.phase = 'done';
    if g.phase = 'clue' then
      if g.turn >= n then
        update shadow_games set phase = 'vote', phase_started_at = now() where room_id = p_room returning * into g;
      elsif not exists (select 1 from room_players where room_id = p_room and child_id = (g.order_ids ->> g.turn)::uuid and left_at is null)
         or now() > g.phase_started_at + make_interval(secs => (v_rules->>'clue_seconds')::int) then
        update shadow_games set clues = clues || jsonb_build_object('i', g.turn, 'text', ''), turn = turn + 1, phase_started_at = now()
         where room_id = p_room returning * into g;
      else
        exit;
      end if;
    elsif g.phase = 'vote' then
      select count(*) into v_voted from jsonb_object_keys(g.votes);
      if v_voted >= v_active or now() > g.phase_started_at + make_interval(secs => (v_rules->>'vote_seconds')::int) then
        select i - 1 into v_shadow_idx from jsonb_array_elements_text(g.order_ids) with ordinality t(id, i) where id::uuid = g.shadow;
        select count(*) into v_shadow_votes from jsonb_each_text(g.votes) where value::int = v_shadow_idx;
        select coalesce(max(c), 0) into v_most from (
          select count(*) c from jsonb_each_text(g.votes) v where v.value::int <> v_shadow_idx group by v.value) x;
        update shadow_games set caught = v_shadow_votes > 0 and v_shadow_votes > v_most where room_id = p_room returning * into g;
        if g.caught then
          update shadow_games set phase = 'guess', phase_started_at = now() where room_id = p_room returning * into g;
        else
          perform shadow_finish(p_room, true);
          select * into g from shadow_games where room_id = p_room;
        end if;
      else
        exit;
      end if;
    elsif g.phase = 'guess' then
      if now() > g.phase_started_at + make_interval(secs => (v_rules->>'guess_seconds')::int) then
        perform shadow_finish(p_room, false);
        select * into g from shadow_games where room_id = p_room;
      else
        exit;
      end if;
    end if;
  end loop;
end $$;

create function public.shadow_room() returns uuid
language sql stable security definer set search_path = public as $$
  select r.id from room_players p join rooms r on r.id = p.room_id
   where p.child_id = auth.uid() and p.left_at is null and r.state = 'playing' and r.game = 'shadow-signal'
$$;

create function public.shadow_clue(p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room uuid := shadow_room();
  g shadow_games;
  v_clue text := lower(trim(coalesce(p_text, '')));
begin
  if v_room is null then raise exception 'you are not in a game'; end if;
  perform shadow_tick(v_room);
  select * into g from shadow_games where room_id = v_room;
  if g.phase <> 'clue' or (g.order_ids ->> g.turn)::uuid <> me then raise exception 'it is not your turn'; end if;
  if v_clue !~ '^[a-z][a-z''-]{0,15}$' then raise exception 'one word, letters only'; end if;
  if chat_flagged(v_clue) then raise exception 'pick a different word'; end if;
  if me <> g.shadow and position(replace(lower(g.word), ' ', '') in replace(v_clue, '-', '')) > 0 then raise exception 'that gives it away'; end if;
  update shadow_games set clues = clues || jsonb_build_object('i', g.turn, 'text', v_clue), turn = turn + 1, phase_started_at = now()
   where room_id = v_room;
  perform shadow_tick(v_room);
end $$;

create function public.shadow_vote(p_index int) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room uuid := shadow_room();
  g shadow_games;
  v_me int;
begin
  if v_room is null then raise exception 'you are not in a game'; end if;
  perform shadow_tick(v_room);
  select * into g from shadow_games where room_id = v_room;
  if g.phase <> 'vote' then raise exception 'it is not time to vote'; end if;
  select i - 1 into v_me from jsonb_array_elements_text(g.order_ids) with ordinality t(id, i) where id::uuid = me;
  if p_index is null or p_index < 0 or p_index >= jsonb_array_length(g.order_ids) or p_index = v_me then raise exception 'pick someone else'; end if;
  if not exists (select 1 from room_players where room_id = v_room and child_id = (g.order_ids ->> p_index)::uuid and left_at is null) then
    raise exception 'pick someone else';
  end if;
  update shadow_games set votes = votes || jsonb_build_object(v_me::text, p_index) where room_id = v_room;
  perform shadow_tick(v_room);
end $$;

create function public.shadow_guess(p_word text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room uuid := shadow_room();
  g shadow_games;
begin
  if v_room is null then raise exception 'you are not in a game'; end if;
  perform shadow_tick(v_room);
  select * into g from shadow_games where room_id = v_room;
  if g.phase <> 'guess' or g.shadow <> me then raise exception 'it is not time to guess'; end if;
  update shadow_games set guess = p_word where room_id = v_room;
  perform shadow_finish(v_room, lower(p_word) = lower(g.word));
end $$;

create function public.shadow_view(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room rooms;
  g shadow_games;
  v_rules jsonb := setting('shadow_rules');
  v_secs int;
  v_me int;
  v_done boolean;
begin
  select * into v_room from rooms where code = upper(trim(p_code)) and game = 'shadow-signal' order by created_at desc limit 1;
  if v_room.id is null or not exists (select 1 from room_players where room_id = v_room.id and child_id = me) then
    raise exception 'you are not in that room';
  end if;
  if v_room.state not in ('playing', 'done') then return jsonb_build_object('state', v_room.state); end if;
  if v_room.state = 'playing' then perform shadow_tick(v_room.id); end if;
  select * into g from shadow_games where room_id = v_room.id;
  select * into v_room from rooms where id = v_room.id;
  v_done := g.phase = 'done';
  select i - 1 into v_me from jsonb_array_elements_text(g.order_ids) with ordinality t(id, i) where id::uuid = me;
  v_secs := case g.phase when 'clue' then (v_rules->>'clue_seconds')::int when 'vote' then (v_rules->>'vote_seconds')::int
                         when 'guess' then (v_rules->>'guess_seconds')::int else 0 end;
  return jsonb_build_object(
    'state', v_room.state, 'phase', g.phase, 'category', g.category, 'turn', g.turn,
    'seconds_left', greatest(0, ceil(extract(epoch from g.phase_started_at + make_interval(secs => v_secs) - now())))::int,
    'seconds', v_secs,
    'is_shadow', g.shadow = me,
    'word', case when g.shadow <> me or v_done then g.word end,
    'options', case when g.shadow = me and g.phase = 'guess' then g.options end,
    'my_vote', g.votes -> v_me::text,
    'players', (select jsonb_agg(jsonb_build_object(
        'i', o.i - 1, 'name', h.display_name, 'starter', h.starter_hero, 'me', h.id = me, 'left', rp.left_at is not null,
        'speaking', g.phase = 'clue' and o.i - 1 = g.turn,
        'clue', (select c ->> 'text' from jsonb_array_elements(g.clues) c where (c ->> 'i')::int = o.i - 1 limit 1),
        'voted', g.votes ? ((o.i - 1)::text),
        'votes', case when v_done then (select count(*) from jsonb_each_text(g.votes) v where v.value::int = o.i - 1) end,
        'shadow', case when v_done then h.id = g.shadow end) order by o.i)
      from jsonb_array_elements_text(g.order_ids) with ordinality o(id, i)
      join heroes h on h.id = o.id::uuid
      join room_players rp on rp.room_id = v_room.id and rp.child_id = h.id),
    'result', case when v_done then jsonb_build_object('caught', g.caught, 'shadow_won', g.shadow_won, 'guess', g.guess, 'word', g.word) end);
end $$;

revoke execute on function public.shadow_deal(uuid), public.shadow_finish(uuid, boolean), public.shadow_tick(uuid),
  public.shadow_room() from public, anon, authenticated;
revoke execute on function public.shadow_clue(text), public.shadow_vote(int), public.shadow_guess(text), public.shadow_view(text) from public, anon;
grant execute on function public.shadow_clue(text), public.shadow_vote(int), public.shadow_guess(text), public.shadow_view(text) to authenticated;

create or replace function public.room_create(p_game text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_grade smallint;
  v_code text;
  v_id uuid;
  v_try int := 0;
begin
  if p_game not in ('trivia-clash', 'odin', 'shadow-signal') then raise exception 'unknown game'; end if;
  if my_room() is not null then raise exception 'leave your room first'; end if;
  select grade into v_grade from heroes where id = me;
  loop
    v_code := (select string_agg(substr('ABCDEFGHJKLMNPRSTUVWXYZ', 1 + floor(random() * 23)::int, 1), '') from generate_series(1, 4));
    begin
      insert into rooms (code, game, host, grade) values (v_code, p_game, me, v_grade) returning id into v_id;
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 20 then raise exception 'try again'; end if;
    end;
  end loop;
  insert into room_players (room_id, child_id) values (v_id, me);
  return v_code;
end $$;

create or replace function public.room_start() returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room rooms;
  v_rules jsonb := setting('room_rules');
  v_n int;
  v_picked text[];
begin
  select r.* into v_room from rooms r where r.host = me and r.state = 'lobby' for update;
  if v_room.id is null then raise exception 'you are not hosting a room'; end if;
  select count(*) into v_n from room_players where room_id = v_room.id and left_at is null;
  if v_n < (v_rules->>'min_players')::int then raise exception 'you need at least 2 players'; end if;

  if v_room.game = 'shadow-signal' then
    perform shadow_deal(v_room.id);
    update rooms set state = 'playing', phase = 'play', idx = 0, phase_started_at = now() where id = v_room.id;
    return;
  end if;
  if v_room.game = 'odin' then
    perform odin_deal(v_room.id);
    update rooms set state = 'playing', phase = 'play', idx = 0, phase_started_at = now() where id = v_room.id;
    return;
  end if;

  select array_agg(id) into v_picked from (
    select q.id from questions q
     where q.active and q.grade = v_room.grade
       and not exists (select 1 from question_history h join room_players p on p.child_id = h.child_id
                        where p.room_id = v_room.id and p.left_at is null and h.question_id = q.id)
     order by random() limit (v_rules->>'questions')::int) s;
  if coalesce(array_length(v_picked, 1), 0) < (v_rules->>'questions')::int then raise exception 'not enough fresh questions'; end if;

  insert into room_questions (room_id, idx, question_id, seconds)
  select v_room.id, t.i - 1, t.id,
         case when position(E'\n\n' in (select prompt from questions where id = t.id)) > 0
              then (v_rules->>'reading_seconds')::int else (v_rules->>'seconds')::int end
    from unnest(v_picked) with ordinality t(id, i);
  insert into question_history (child_id, question_id)
  select p.child_id, q from room_players p, unnest(v_picked) q where p.room_id = v_room.id and p.left_at is null
  on conflict do nothing;
  update rooms set state = 'playing', phase = 'question', idx = 0, phase_started_at = now() where id = v_room.id;
end $$;
