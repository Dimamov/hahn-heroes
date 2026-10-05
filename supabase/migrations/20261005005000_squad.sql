-- Friends and squads. Friends connect by hero code and must accept. A squad is up to 5 heroes
-- who are friends of the squad leader and accept an invite. Nothing is deleted: rows are marked.

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references public.heroes (id) on delete cascade,   -- who asked
  b uuid not null references public.heroes (id) on delete cascade,   -- who was asked
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'removed')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (a <> b)
);
create unique index friendships_pair_idx on public.friendships (least(a, b), greatest(a, b));
create index friendships_b_idx on public.friendships (b);

create table public.squads (
  id uuid primary key default gen_random_uuid(),
  leader uuid not null references public.heroes (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  disbanded_at timestamptz
);
create table public.squad_members (
  squad_id uuid not null references public.squads (id) on delete cascade,
  child_id uuid not null references public.heroes (id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'member', 'declined', 'left')),
  created_at timestamptz not null default now(),
  primary key (squad_id, child_id)
);
create index squad_members_child_idx on public.squad_members (child_id);

alter table public.friendships enable row level security;
alter table public.squads enable row level security;
alter table public.squad_members enable row level security;
revoke all on public.friendships, public.squads, public.squad_members from anon, authenticated;

-- Preset squad names, so there is nothing free-typed to moderate.
insert into public.app_settings (key, value) values
  ('squad_name_words', '{"adjectives": ["Brave","Swift","Bright","Bold","Kind","Wild","Clever","Mighty","Lucky","Cosmic"], "nouns": ["Wolves","Comets","Owls","Foxes","Falcons","Dragons","Stars","Lions","Sparks","Titans"], "max_members": 5}')
on conflict (key) do nothing;

create function public.me_hero() returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid := auth.uid();
begin
  if v is null or not exists (select 1 from heroes where id = v) then raise exception 'not signed in'; end if;
  return v;
end $$;

create function public.friend_request(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_other heroes;
  v_row friendships;
begin
  select * into v_other from heroes where hero_code = upper(trim(p_code));
  if v_other.id is null then raise exception 'no hero has that code'; end if;
  if v_other.id = me then raise exception 'that is your own code'; end if;
  select * into v_row from friendships where least(a, b) = least(me, v_other.id) and greatest(a, b) = greatest(me, v_other.id);
  if v_row.id is not null then
    if v_row.status in ('pending', 'accepted') then raise exception 'already friends or waiting'; end if;
    update friendships set a = me, b = v_other.id, status = 'pending', decided_at = null where id = v_row.id;
  else
    insert into friendships (a, b) values (me, v_other.id);
  end if;
  return jsonb_build_object('name', v_other.display_name);
end $$;

create function public.friend_respond(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  update friendships set status = case when p_accept then 'accepted' else 'declined' end, decided_at = now()
   where id = p_id and b = me and status = 'pending';
  if not found then raise exception 'no such request'; end if;
end $$;

create function public.friend_remove(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  update friendships set status = 'removed', decided_at = now() where id = p_id and status = 'accepted' and me in (a, b);
  if not found then raise exception 'not your friend'; end if;
end $$;

create function public.my_friends() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  return jsonb_build_object(
    'friends', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'hero_id', h.id, 'name', h.display_name, 'grade', h.grade, 'starter', h.starter_hero) order by h.display_name)
                           from friendships f join heroes h on h.id = case when f.a = me then f.b else f.a end
                          where f.status = 'accepted' and me in (f.a, f.b)), '[]'::jsonb),
    'incoming', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', h.display_name, 'grade', h.grade, 'starter', h.starter_hero) order by f.created_at)
                            from friendships f join heroes h on h.id = f.a where f.status = 'pending' and f.b = me), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', h.display_name) order by f.created_at)
                            from friendships f join heroes h on h.id = f.b where f.status = 'pending' and f.a = me), '[]'::jsonb));
end $$;

create function public.squad_create(p_adjective text, p_noun text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_words jsonb := setting('squad_name_words');
  v_id uuid;
begin
  if not (v_words->'adjectives') ? p_adjective or not (v_words->'nouns') ? p_noun then raise exception 'pick a name from the list'; end if;
  if exists (select 1 from squad_members m join squads s on s.id = m.squad_id
              where m.child_id = me and m.status = 'member' and s.disbanded_at is null) then
    raise exception 'leave your squad first';
  end if;
  insert into squads (leader, name) values (me, p_adjective || ' ' || p_noun) returning id into v_id;
  insert into squad_members (squad_id, child_id, status) values (v_id, me, 'member');
  return v_id;
end $$;

create function public.squad_invite(p_friend uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_squad squads;
  v_taken int;
begin
  select s.* into v_squad from squads s join squad_members m on m.squad_id = s.id
   where s.leader = me and m.child_id = me and m.status = 'member' and s.disbanded_at is null;
  if v_squad.id is null then raise exception 'only a squad leader can invite'; end if;
  if not exists (select 1 from friendships f where f.status = 'accepted' and least(f.a, f.b) = least(me, p_friend) and greatest(f.a, f.b) = greatest(me, p_friend)) then
    raise exception 'you can only invite friends';
  end if;
  select count(*) into v_taken from squad_members where squad_id = v_squad.id and status in ('member', 'invited');
  if v_taken >= (setting('squad_name_words')->>'max_members')::int then raise exception 'the squad is full'; end if;
  insert into squad_members (squad_id, child_id, status) values (v_squad.id, p_friend, 'invited')
  on conflict (squad_id, child_id) do update set status = 'invited' where squad_members.status in ('declined', 'left');
end $$;

create function public.squad_respond(p_squad uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  if p_accept and exists (select 1 from squad_members m join squads s on s.id = m.squad_id
                           where m.child_id = me and m.status = 'member' and s.disbanded_at is null) then
    raise exception 'leave your squad first';
  end if;
  update squad_members set status = case when p_accept then 'member' else 'declined' end
   where squad_id = p_squad and child_id = me and status = 'invited';
  if not found then raise exception 'no such invite'; end if;
end $$;

-- Leaving as a member leaves quietly. The leader leaving disbands the squad.
create function public.squad_leave() returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_squad squads;
begin
  select s.* into v_squad from squads s join squad_members m on m.squad_id = s.id
   where m.child_id = me and m.status = 'member' and s.disbanded_at is null;
  if v_squad.id is null then return; end if;
  if v_squad.leader = me then
    update squads set disbanded_at = now() where id = v_squad.id;
  else
    update squad_members set status = 'left' where squad_id = v_squad.id and child_id = me;
  end if;
end $$;

create function public.my_squad() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_squad squads;
begin
  select s.* into v_squad from squads s join squad_members m on m.squad_id = s.id
   where m.child_id = me and m.status = 'member' and s.disbanded_at is null;
  return jsonb_build_object(
    'squad', case when v_squad.id is null then null else jsonb_build_object(
      'id', v_squad.id, 'name', v_squad.name, 'leader', v_squad.leader = me,
      'members', (select jsonb_agg(jsonb_build_object('hero_id', h.id, 'name', h.display_name, 'starter', h.starter_hero, 'status', m.status, 'is_leader', h.id = v_squad.leader)
                                   order by (h.id = v_squad.leader) desc, h.display_name)
                    from squad_members m join heroes h on h.id = m.child_id
                   where m.squad_id = v_squad.id and (m.status = 'member' or (m.status = 'invited' and v_squad.leader = me)))) end,
    'invites', coalesce((select jsonb_agg(jsonb_build_object('squad_id', s.id, 'name', s.name, 'leader_name', h.display_name))
                           from squad_members m join squads s on s.id = m.squad_id join heroes h on h.id = s.leader
                          where m.child_id = me and m.status = 'invited' and s.disbanded_at is null), '[]'::jsonb));
end $$;

revoke execute on function public.me_hero() from public, anon, authenticated;
revoke execute on function public.friend_request(text), public.friend_respond(uuid, boolean), public.friend_remove(uuid), public.my_friends(),
  public.squad_create(text, text), public.squad_invite(uuid), public.squad_respond(uuid, boolean), public.squad_leave(), public.my_squad() from public, anon;
grant execute on function public.friend_request(text), public.friend_respond(uuid, boolean), public.friend_remove(uuid), public.my_friends(),
  public.squad_create(text, text), public.squad_invite(uuid), public.squad_respond(uuid, boolean), public.squad_leave(), public.my_squad() to authenticated;
