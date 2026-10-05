# HAHN Heroes backend (Supabase)

Separate from the ANA, HAMRIQ and Detcord systems: use a dedicated Supabase project.

- `migrations/`: the database. Students can only read their own rows; every reward and purchase goes through `award()` and `spend()`, which run on the server.
- `functions/kid-signup`, `functions/kid-signin`: hero code plus picture password sign-in (no email).
- `functions/_shared/`: rules used by both the functions and the app's demo mode.
- `tests/`: SQL tests, run with `npm run test:db` (needs local Postgres 15+).

Setup (once a project exists): `supabase link`, `supabase db push`, `supabase functions deploy kid-signup kid-signin`, then put the project URL and publishable key in `.env`.

## Push notifications

Needs two secrets in the Supabase dashboard (Edge Functions, Secrets): `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`
(optional `VAPID_SUBJECT`, default `mailto:info@detcorddigital.com`). Make the pair with `node scripts/vapid-keys.mjs`
and keep the private one private. Until they exist the app shows "Notifications are not set up yet".
The database queues messages (chores, announcements, Trivia Night, weekly summary) and a pg_cron job calls the
`push-send` function every minute to deliver them. Quiet hours are 9 pm to 7 am school time.
