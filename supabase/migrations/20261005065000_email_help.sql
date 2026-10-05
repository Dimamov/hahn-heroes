-- "Didn't get the email?": a grown-up who never got the confirmation email can tell the Sensei. Only the email
-- address and the time are saved (no free text). Requests are never removed: the Sensei marks them done.
create table public.email_help_requests (
  id bigint generated always as identity primary key,
  email text not null check (char_length(email) between 5 and 120),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.email_help_requests enable row level security;
revoke all on public.email_help_requests from public, anon, authenticated;

create function public.email_help_request(p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 120 then return jsonb_build_object('ok', false, 'bad_email', true); end if;
  -- Quiet limits so the form can't be used to flood the Sensei: 3 per address per hour, 60 in all per hour.
  if (select count(*) from email_help_requests where email = v_email and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from email_help_requests where created_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  insert into email_help_requests (email) values (v_email);
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.email_help_request(text) to anon, authenticated;

create function public.sensei_email_requests() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'email', r.email, 'at', r.created_at) order by r.created_at desc)
                     from (select * from email_help_requests where resolved_at is null order by created_at desc limit 100) r), '[]'::jsonb);
end $$;

create function public.sensei_email_request_done(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  -- Close every open request from the same address at once.
  update email_help_requests set resolved_at = now()
   where resolved_at is null and email = (select email from email_help_requests where id = p_id);
end $$;
revoke execute on function public.sensei_email_requests(), public.sensei_email_request_done(bigint) from public, anon;
grant execute on function public.sensei_email_requests(), public.sensei_email_request_done(bigint) to authenticated;
