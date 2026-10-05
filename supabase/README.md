# HAHN Heroes backend (Supabase)

Separate from the ANA, HAMRIQ and Detcord systems: use a dedicated Supabase project.

- `migrations/`: the database. Students can only read their own rows; every reward and purchase goes through `award()` and `spend()`, which run on the server.
- `functions/kid-signup`, `functions/kid-signin`: hero code plus picture password sign-in (no email).
- `functions/_shared/`: rules used by both the functions and the app's demo mode.
- `tests/`: SQL tests, run with `npm run test:db` (needs local Postgres 15+).

Setup (once a project exists): `supabase link`, `supabase db push`, `supabase secrets set KID_AUTH_SECRET=$(openssl rand -hex 32)`, `supabase functions deploy kid-signup kid-signin`, then put the project URL and publishable key in `.env`.
