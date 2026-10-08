-- The Sensei can also use the parent portal for their own linked children.
create or replace function public.is_parent_like() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from adults where id = auth.uid() and role in ('parent', 'sensei') and approved)
$$;
grant execute on function public.is_parent_like() to authenticated;

create or replace function public.parent_of(p_child uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from parent_links pl join adults a on a.id = pl.parent_id
                  where pl.child_id = p_child and pl.parent_id = auth.uid() and a.role in ('parent', 'sensei') and a.approved)
$$;

create or replace function public.my_children() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', h.id, 'display_name', h.display_name, 'grade', h.grade, 'starter_hero', h.starter_hero,
      'waiting', (select count(*) from home_missions m where m.child_id = h.id and m.status = 'submitted')
    ) order by h.display_name), '[]'::jsonb)
  from parent_links pl
  join heroes h on h.id = pl.child_id
  join adults a on a.id = pl.parent_id and a.role in ('parent', 'sensei') and a.approved
  where pl.parent_id = auth.uid()
$$;

create or replace function public.claim_link_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_parent uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_row link_codes;
  v_child heroes;
begin
  if not is_parent_like() then raise exception 'only parents can link a child'; end if;
  if too_many_code_tries('link') then return jsonb_build_object('ok', false, 'error', 'too_many_tries'); end if;

  select * into v_row from link_codes
   where code = v_code and used_at is null and expires_at > now() for update;
  if not found then
    insert into code_attempts (actor, kind) values (v_parent, 'link');
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  update link_codes set used_at = now(), used_by = v_parent where id = v_row.id;
  insert into parent_links (child_id, parent_id) values (v_row.child_id, v_parent) on conflict do nothing;
  select * into v_child from heroes where id = v_row.child_id;
  return jsonb_build_object('ok', true, 'child_id', v_child.id, 'display_name', v_child.display_name, 'grade', v_child.grade);
end $$;
