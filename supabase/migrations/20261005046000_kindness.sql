-- Kindness points: a hero can nominate a squad mate once a day, picking a preset reason (no typing).
-- A teacher of the nominee's class, or the Sensei, approves or skips each nomination. An approved one
-- gives the nominee 5 diamonds, up to 3 approved a week (15 diamonds). Nominators never see who was
-- approved; nominees see only the reason, not who nominated them.
create table public.kind_nominations (
  id bigint generated always as identity primary key,
  nominator uuid not null references public.heroes (id) on delete cascade,
  nominee uuid not null references public.heroes (id) on delete cascade,
  reason text not null,
  day date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'skipped')),
  decided_by uuid references public.adults (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (nominator, day),
  check (nominator <> nominee)
);
create index kind_nominations_nominee_idx on public.kind_nominations (nominee, status);
alter table public.kind_nominations enable row level security;
revoke all on public.kind_nominations from anon, authenticated;

create function public.kind_reasons() returns text[]
language sql immutable set search_path = public as $$
  select array['hard-question', 'great-idea', 'cheered', 'teamwork', 'included', 'kind-words', 'taught', 'positive']
$$;

create function public.kind_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_squad uuid := base_squad(me);
begin
  return jsonb_build_object(
    'nominated_today', exists (select 1 from kind_nominations where nominator = me and day = school_date(now())),
    'mates', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'name', h.display_name) order by h.display_name)
                         from squad_members m join heroes h on h.id = m.child_id where m.squad_id = v_squad and m.status = 'member' and m.child_id <> me), '[]'::jsonb),
    'received', coalesce((select jsonb_agg(jsonb_build_object('reason', k.reason, 'day', k.day) order by k.id desc)
                            from (select * from kind_nominations where nominee = me and status = 'approved' order by id desc limit 10) k), '[]'::jsonb));
end $$;

create function public.kind_nominate(p_hero uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero(); v_squad uuid := base_squad(me);
begin
  if not (p_reason = any (kind_reasons())) then raise exception 'pick one of the reasons'; end if;
  if v_squad is null or p_hero is null or p_hero = me or base_squad(p_hero) is distinct from v_squad then raise exception 'you can nominate a squad mate'; end if;
  if exists (select 1 from kind_nominations where nominator = me and day = school_date(now())) then raise exception 'you already nominated someone today'; end if;
  insert into kind_nominations (nominator, nominee, reason, day) values (me, p_hero, p_reason, school_date(now()));
end $$;

-- Pending nominations a grown-up may decide: the Sensei sees all, a teacher sees their own students.
create function public.kind_review() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_role('sensei') or is_role('teacher')) then raise exception 'only teachers and the Sensei can review'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', k.id, 'nominator', a.display_name, 'nominee', b.display_name, 'reason', k.reason, 'day', k.day,
             'repeat', exists (select 1 from kind_nominations r where r.nominator = k.nominee and r.nominee = k.nominator and r.day > k.day - 7)) order by k.id)
      from (select * from kind_nominations where status = 'pending' order by id limit 200) k
      join heroes a on a.id = k.nominator join heroes b on b.id = k.nominee
     where is_role('sensei') or teaches_child(k.nominee)), '[]'::jsonb);
end $$;

create function public.kind_decide(p_id bigint, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  k kind_nominations;
  v_week date;
  v_given int;
begin
  select * into k from kind_nominations where id = p_id and status = 'pending' for update;
  if k.id is null then raise exception 'that nomination is not waiting'; end if;
  if not (is_role('sensei') or (is_role('teacher') and teaches_child(k.nominee))) then raise exception 'that is not your student'; end if;
  update kind_nominations set status = case when p_approve then 'approved' else 'skipped' end, decided_by = auth.uid(), decided_at = now() where id = p_id;
  if not p_approve then return jsonb_build_object('ok', true, 'awarded', 0); end if;
  v_week := school_week(k.created_at);
  select count(*) into v_given from kind_nominations where nominee = k.nominee and status = 'approved' and school_week(created_at) = v_week and id <> k.id;
  if v_given >= 3 then return jsonb_build_object('ok', true, 'awarded', 0); end if;
  perform award(k.nominee, 'coins', 5, 'event', 'Kindness', 'kind:' || k.id);
  return jsonb_build_object('ok', true, 'awarded', 5);
end $$;

revoke execute on function public.kind_reasons() from public, anon, authenticated;
revoke execute on function public.kind_state(), public.kind_nominate(uuid, text), public.kind_review(), public.kind_decide(bigint, boolean) from public, anon;
grant execute on function public.kind_state(), public.kind_nominate(uuid, text), public.kind_review(), public.kind_decide(bigint, boolean) to authenticated;
