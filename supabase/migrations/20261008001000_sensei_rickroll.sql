-- The Sensei can send every hero's screen to the Do Not Press rickroll. Additive only: one small log table.
-- Heroes poll rickroll_latest() and react to an id they have not seen, only when it is fresh.
create table public.sensei_rickrolls (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid()
);
alter table public.sensei_rickrolls enable row level security;
revoke all on public.sensei_rickrolls from anon, authenticated;

create function public.sensei_rickroll() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do that'; end if;
  if exists (select 1 from sensei_rickrolls where created_at > now() - interval '30 seconds') then
    raise exception 'wait a little before the next one';
  end if;
  insert into sensei_rickrolls default values returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create function public.rickroll_latest() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r sensei_rickrolls;
begin
  if me_hero() is null then return null; end if;
  select * into r from sensei_rickrolls order by id desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('id', r.id, 'ageSeconds', extract(epoch from (now() - r.created_at))::int);
end $$;

revoke execute on function public.sensei_rickroll() from public, anon;
revoke execute on function public.rickroll_latest() from public, anon;
grant execute on function public.sensei_rickroll() to authenticated;
grant execute on function public.rickroll_latest() to authenticated;
