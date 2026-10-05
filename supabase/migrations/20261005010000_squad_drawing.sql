-- Squad Drawing: one hero draws a curated word while the others guess. Everyone draws once. Strokes are
-- stored on the server and polled, guesses are filtered, and any guesser can report a drawing.

alter table public.rooms drop constraint rooms_game_check;
alter table public.rooms add constraint rooms_game_check check (game in ('trivia-clash', 'odin', 'shadow-signal', 'squad-drawing'));

create table public.drawing_words (word text primary key);
insert into public.drawing_words (word)
select unnest(string_to_array('cat,dog,house,tree,sun,moon,star,car,boat,airplane,fish,flower,apple,banana,pizza,robot,rocket,castle,dragon,bridge,bicycle,guitar,umbrella,snowman,rainbow,butterfly,spider,penguin,elephant,giraffe,shark,turtle,cupcake,ice cream,hamburger,clock,key,crown,ladder,tent,volcano,pumpkin,ghost,kite,balloon,backpack,book,pencil,glasses,hat,shoe,television,camera,computer,mountain,island,waterfall,owl,snail', ','));

create table public.drawing_games (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  order_ids jsonb not null,
  round int not null default 0,
  word text not null,
  words_used jsonb not null default '[]',
  phase text not null default 'draw' check (phase in ('draw', 'reveal')),
  phase_started_at timestamptz not null default now(),
  strokes jsonb not null default '[]',
  solved jsonb not null default '{}',
  voided boolean not null default false
);
create table public.drawing_guesses (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  round int not null,
  child_id uuid not null references public.heroes (id) on delete cascade,
  body text not null,
  correct boolean not null default false,
  created_at timestamptz not null default now()
);
create index drawing_guesses_room_idx on public.drawing_guesses (room_id, id desc);
create table public.drawing_reports (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  round int not null,
  artist uuid not null references public.heroes (id) on delete cascade,
  reporter uuid not null references public.heroes (id) on delete cascade,
  word text not null,
  created_at timestamptz not null default now(),
  unique (room_id, round, reporter)
);
alter table public.drawing_words enable row level security;
alter table public.drawing_games enable row level security;
alter table public.drawing_guesses enable row level security;
alter table public.drawing_reports enable row level security;
revoke all on public.drawing_words, public.drawing_games, public.drawing_guesses, public.drawing_reports from anon, authenticated;

insert into public.app_settings (key, value) values
  ('drawing_rules', '{"seconds": 60, "reveal_seconds": 6, "max_strokes": 300, "max_points": 150}') on conflict (key) do nothing;

create function public.drawing_deal(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order jsonb;
  v_word text;
begin
  select jsonb_agg(child_id order by random()) into v_order from room_players where room_id = p_room and left_at is null;
  select word into v_word from drawing_words order by random() limit 1;
  insert into drawing_games (room_id, order_ids, word, words_used) values (p_room, v_order, v_word, jsonb_build_array(v_word));
end $$;

-- Moves the game on when time is up or everyone has guessed. Callers pass the room id.
create function public.drawing_tick(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  g drawing_games;
  v_rules jsonb := setting('drawing_rules');
  v_active int;
  v_guessers int;
  v_solved int;
  v_artist uuid;
  v_word text;
begin
  select * into g from drawing_games where room_id = p_room for update;
  if g.room_id is null or not exists (select 1 from rooms where id = p_room and state = 'playing') then return; end if;
  select count(*) into v_active from room_players where room_id = p_room and left_at is null;
  if v_active < 2 then
    update rooms set state = 'done' where id = p_room;
    return;
  end if;
  loop
    v_artist := (g.order_ids ->> g.round)::uuid;
    if g.phase = 'draw' then
      select count(*) into v_guessers from room_players where room_id = p_room and left_at is null and child_id <> v_artist;
      select count(*) into v_solved from jsonb_object_keys(g.solved);
      if g.voided or v_solved >= v_guessers
         or not exists (select 1 from room_players where room_id = p_room and child_id = v_artist and left_at is null)
         or now() > g.phase_started_at + make_interval(secs => (v_rules->>'seconds')::int) then
        if not g.voided then
          update room_players set score = score + 50 * v_solved where room_id = p_room and child_id = v_artist;
        end if;
        update drawing_games set phase = 'reveal', phase_started_at = now() where room_id = p_room returning * into g;
      else
        exit;
      end if;
    else
      if now() > g.phase_started_at + make_interval(secs => (v_rules->>'reveal_seconds')::int) then
        if g.round + 1 >= jsonb_array_length(g.order_ids) then
          update rooms set state = 'done' where id = p_room;
          exit;
        end if;
        select word into v_word from drawing_words where not (g.words_used ? word) order by random() limit 1;
        update drawing_games set round = round + 1, word = v_word, words_used = words_used || to_jsonb(v_word), phase = 'draw',
               phase_started_at = now(), strokes = '[]', solved = '{}', voided = false where room_id = p_room returning * into g;
      else
        exit;
      end if;
    end if;
  end loop;
end $$;

create function public.drawing_room() returns uuid
language sql stable security definer set search_path = public as $$
  select r.id from room_players p join rooms r on r.id = p.room_id
   where p.child_id = auth.uid() and p.left_at is null and r.state = 'playing' and r.game = 'squad-drawing'
$$;

create function public.drawing_stroke(p_id int, p_color text, p_width int, p_points jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room uuid := drawing_room();
  g drawing_games;
  v_rules jsonb := setting('drawing_rules');
  e jsonb;
  v_len int;
  v_last jsonb;
begin
  if v_room is null then raise exception 'you are not in a game'; end if;
  perform drawing_tick(v_room);
  select * into g from drawing_games where room_id = v_room;
  if g.phase <> 'draw' or (g.order_ids ->> g.round)::uuid <> me then raise exception 'you are not drawing'; end if;
  if p_color !~ '^#[0-9a-f]{6}$' or p_width not between 1 and 24 then raise exception 'bad pen'; end if;
  if jsonb_typeof(p_points) <> 'array' or jsonb_array_length(p_points) not between 1 and (v_rules->>'max_points')::int then raise exception 'bad stroke'; end if;
  for e in select jsonb_array_elements(p_points) loop
    if jsonb_typeof(e) <> 'array' or jsonb_array_length(e) <> 2
       or jsonb_typeof(e -> 0) <> 'number' or jsonb_typeof(e -> 1) <> 'number'
       or (e ->> 0)::numeric not between 0 and 1000 or (e ->> 1)::numeric not between 0 and 1000 then
      raise exception 'bad stroke';
    end if;
  end loop;
  v_len := jsonb_array_length(g.strokes);
  v_last := g.strokes -> (v_len - 1);
  if v_len > 0 and (v_last ->> 'id')::int = p_id then
    if jsonb_array_length(v_last -> 'p') + jsonb_array_length(p_points) > 1500 then raise exception 'that line is too long'; end if;
    update drawing_games set strokes = jsonb_set(strokes, array[(v_len - 1)::text], jsonb_set(v_last, '{p}', (v_last -> 'p') || p_points))
     where room_id = v_room;
  else
    if v_len >= (v_rules->>'max_strokes')::int then raise exception 'the page is full'; end if;
    update drawing_games set strokes = strokes || jsonb_build_object('id', p_id, 'c', p_color, 'w', p_width, 'p', p_points) where room_id = v_room;
  end if;
end $$;

create function public.drawing_clear() returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room uuid := drawing_room();
  g drawing_games;
begin
  if v_room is null then raise exception 'you are not in a game'; end if;
  select * into g from drawing_games where room_id = v_room;
  if g.phase <> 'draw' or (g.order_ids ->> g.round)::uuid <> me then raise exception 'you are not drawing'; end if;
  update drawing_games set strokes = '[]' where room_id = v_room;
end $$;

create function public.drawing_guess(p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room uuid := drawing_room();
  g drawing_games;
  v_rules jsonb := setting('drawing_rules');
  v_g text := lower(regexp_replace(trim(coalesce(p_text, '')), '\s+', ' ', 'g'));
  v_flat text;
  v_target text;
  v_points int := 0;
  v_ok boolean;
begin
  if v_room is null then raise exception 'you are not in a game'; end if;
  perform drawing_tick(v_room);
  select * into g from drawing_games where room_id = v_room;
  if g.phase <> 'draw' then raise exception 'the round is over'; end if;
  if (g.order_ids ->> g.round)::uuid = me then raise exception 'you are drawing'; end if;
  if g.solved ? me::text then raise exception 'you already got it'; end if;
  if v_g !~ '^[a-z ]{1,24}$' then raise exception 'letters only'; end if;
  if chat_flagged(v_g) then raise exception 'pick a different word'; end if;
  if exists (select 1 from drawing_guesses where room_id = v_room and child_id = me and created_at > clock_timestamp() - interval '1 second') then
    raise exception 'slow down';
  end if;
  v_flat := replace(v_g, ' ', '');
  v_target := replace(g.word, ' ', '');
  v_ok := v_flat = v_target or v_flat = v_target || 's';
  if v_ok then
    v_points := 100 + floor(50 * greatest(0, 1 - extract(epoch from now() - g.phase_started_at) / (v_rules->>'seconds')::int))::int;
    update drawing_games set solved = solved || jsonb_build_object(me::text, v_points) where room_id = v_room;
    update room_players set score = score + v_points where room_id = v_room and child_id = me;
  end if;
  insert into drawing_guesses (room_id, round, child_id, body, correct, created_at) values (v_room, g.round, me, v_g, v_ok, clock_timestamp());
  perform drawing_tick(v_room);
  return jsonb_build_object('correct', v_ok, 'points', v_points);
end $$;

create function public.drawing_report() returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room uuid := drawing_room();
  g drawing_games;
  v_artist uuid;
  v_n int;
  v_guessers int;
begin
  if v_room is null then raise exception 'you are not in a game'; end if;
  select * into g from drawing_games where room_id = v_room;
  v_artist := (g.order_ids ->> g.round)::uuid;
  if v_artist = me then raise exception 'you are drawing'; end if;
  insert into drawing_reports (room_id, round, artist, reporter, word) values (v_room, g.round, v_artist, me, g.word)
  on conflict (room_id, round, reporter) do nothing;
  select count(*) into v_n from drawing_reports where room_id = v_room and round = g.round;
  select count(*) into v_guessers from room_players where room_id = v_room and left_at is null and child_id <> v_artist;
  if g.phase = 'draw' and v_n >= least(2, v_guessers) then
    update drawing_games set voided = true, strokes = '[]' where room_id = v_room;
    perform drawing_tick(v_room);
  end if;
end $$;

create function public.sensei_drawing_reports() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('artist', a.display_name, 'reporter', r.display_name, 'word', x.word, 'at', x.created_at) order by x.created_at desc)
                     from (select * from drawing_reports order by created_at desc limit 40) x
                     join heroes a on a.id = x.artist join heroes r on r.id = x.reporter), '[]'::jsonb);
end $$;

create function public.drawing_view(p_code text, p_since int default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_room rooms;
  g drawing_games;
  v_rules jsonb := setting('drawing_rules');
  v_secs int := (setting('drawing_rules')->>'seconds')::int;
  v_artist uuid;
  v_since int := greatest(0, coalesce(p_since, 0));
  v_len int;
  v_mine boolean;
  v_solved boolean;
  v_know boolean;
  v_elapsed numeric;
begin
  select * into v_room from rooms where code = upper(trim(p_code)) and game = 'squad-drawing' order by created_at desc limit 1;
  if v_room.id is null or not exists (select 1 from room_players where room_id = v_room.id and child_id = me) then
    raise exception 'you are not in that room';
  end if;
  if v_room.state not in ('playing', 'done') then return jsonb_build_object('state', v_room.state); end if;
  if v_room.state = 'playing' then perform drawing_tick(v_room.id); end if;
  select * into v_room from rooms where id = v_room.id;
  select * into g from drawing_games where room_id = v_room.id;
  v_artist := (g.order_ids ->> g.round)::uuid;
  v_mine := v_artist = me;
  v_solved := g.solved ? me::text;
  v_know := v_mine or v_solved or g.phase = 'reveal' or v_room.state = 'done';
  v_len := jsonb_array_length(g.strokes);
  v_since := least(v_since, v_len);
  v_elapsed := extract(epoch from now() - g.phase_started_at);
  return jsonb_build_object(
    'state', v_room.state, 'phase', g.phase, 'round', g.round, 'rounds', jsonb_array_length(g.order_ids),
    'seconds', case when g.phase = 'draw' then v_secs else (v_rules->>'reveal_seconds')::int end,
    'seconds_left', greatest(0, ceil(case when g.phase = 'draw' then v_secs - v_elapsed else (v_rules->>'reveal_seconds')::int - v_elapsed end))::int,
    'is_artist', v_mine, 'solved', v_solved, 'voided', g.voided,
    'artist', (select display_name from heroes where id = v_artist),
    'word', case when v_know then g.word end,
    'pattern', case when v_know then null else
        (select string_agg(case when ch = ' ' then ' ' when i = 1 and v_elapsed > v_secs / 2 then ch else '_' end, '' order by i)
           from regexp_split_to_table(g.word, '') with ordinality t(ch, i)) end,
    'strokes_from', v_since,
    'strokes', (select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from jsonb_array_elements(g.strokes) with ordinality t(e, i) where i - 1 >= v_since),
    'guesses', coalesce((select jsonb_agg(jsonb_build_object('name', h.display_name, 'text', case when q.correct then null else q.body end, 'correct', q.correct, 'me', q.child_id = me) order by q.id)
                           from (select * from drawing_guesses where room_id = v_room.id and round = g.round order by id desc limit 12) q
                           join heroes h on h.id = q.child_id), '[]'::jsonb),
    'players', (select jsonb_agg(jsonb_build_object('name', h.display_name, 'starter', h.starter_hero, 'score', rp.score, 'me', h.id = me,
                  'artist', h.id = v_artist and v_room.state = 'playing', 'solved', g.solved ? h.id::text, 'left', rp.left_at is not null)
                  order by rp.score desc, h.display_name)
                from room_players rp join heroes h on h.id = rp.child_id where rp.room_id = v_room.id));
end $$;

revoke execute on function public.drawing_deal(uuid), public.drawing_tick(uuid), public.drawing_room() from public, anon, authenticated;
revoke execute on function public.drawing_stroke(int, text, int, jsonb), public.drawing_clear(), public.drawing_guess(text), public.drawing_report(),
  public.sensei_drawing_reports(), public.drawing_view(text, int) from public, anon;
grant execute on function public.drawing_stroke(int, text, int, jsonb), public.drawing_clear(), public.drawing_guess(text), public.drawing_report(),
  public.sensei_drawing_reports(), public.drawing_view(text, int) to authenticated;

create or replace function public.room_create(p_game text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_grade smallint;
  v_code text;
  v_id uuid;
  v_try int := 0;
begin
  if p_game not in ('trivia-clash', 'odin', 'shadow-signal', 'squad-drawing') then raise exception 'unknown game'; end if;
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

  if v_room.game = 'squad-drawing' then
    perform drawing_deal(v_room.id);
    update rooms set state = 'playing', phase = 'play', idx = 0, phase_started_at = now() where id = v_room.id;
    return;
  end if;
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
