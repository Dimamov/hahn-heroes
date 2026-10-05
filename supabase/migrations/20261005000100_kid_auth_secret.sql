-- The server-only secret that turns a hero code and picture password into an auth password.
-- Generated inside the database, never shown to the app, readable only by the service role
-- (the sign-in functions). Use `supabase secrets set KID_AUTH_SECRET=...` instead if you
-- prefer; the functions use that environment variable when it exists.
create table public.app_secrets (
  key text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

insert into public.app_secrets (key, value)
values ('kid_auth_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

create function public.kid_auth_secret() returns text
language sql stable security definer set search_path = public as $$
  select value from public.app_secrets where key = 'kid_auth_secret'
$$;
revoke execute on function public.kid_auth_secret() from public, anon, authenticated;
grant execute on function public.kid_auth_secret() to service_role;
