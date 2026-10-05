-- The Sensei can remove old announcements. Nothing is erased: a removed one is marked and hidden.
alter table public.announcements add column deleted_at timestamptz;
alter policy "everyone signed in reads announcements" on public.announcements using (deleted_at is null);

create or replace function public.unread_announcements() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from announcements a
   where auth.uid() is not null and a.deleted_at is null
     and not exists (select 1 from announcement_reads r where r.user_id = auth.uid() and r.announcement_id = a.id)
$$;

create or replace function public.mark_announcements_read() returns void
language sql security definer set search_path = public as $$
  insert into announcement_reads (user_id, announcement_id)
  select auth.uid(), a.id from announcements a where auth.uid() is not null and a.deleted_at is null
  on conflict do nothing
$$;

create function public.sensei_delete_announcement(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do that'; end if;
  update announcements set deleted_at = now() where id = p_id and deleted_at is null;
  if not found then raise exception 'no such announcement'; end if;
end $$;

revoke execute on function public.sensei_delete_announcement(bigint) from public, anon;
grant execute on function public.sensei_delete_announcement(bigint) to authenticated;
