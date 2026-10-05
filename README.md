# HAHN Heroes

H.A.H.N. (Heroes Awakening: Hidden Nexus) is a free, anime-style learning app for 5th and 6th graders at Hahn Intermediate School. It is an installable PWA (phones, tablets and desktop) backed by Supabase, hosted on Cloudflare. It is separate from the ANA, HAMRIQ and Detcord systems.

## Status

Milestone 1, the foundation:

- Installable full-screen app shell with iPhone safe areas; every screen fits without scrolling
- Swipe pages (no previous/next arrows) for the Nexus home and the hero picker
- Nexus home with all main destinations (most show "coming soon" until their milestone)
- Kid sign-up and sign-in with a hero code plus a picture password, and a printable QR hero card
- Hero picking: 20 starter slots, 5 with finished art (Ana's squad), the rest show the template
- Server-side reward ledger: one award per reward key, weekly 500 Home plus 500 Class cap, append-only, students can't write to it
- Demo mode: with no Supabase project connected, everything runs on this device

Milestone 2, grown-ups: parent, teacher and Sensei accounts; one-time link codes; home missions (parent approves); class missions (teacher pastes a reading, kids answer, 80% passes, coins scale with score); announcements; Sensei overview, teacher approval and Trivia Night time. The Sensei role can only be granted in SQL.

The full plan is in the project thread. Later milestones: parents/teachers/Sensei, learning engine, solo arcade, squad play, collections, story and events.

## Run it

```
npm install
npm run dev          # http://localhost:5173, demo mode
npm test             # unit tests
npm run test:db      # database rules, needs local Postgres 15+
npm run build
```

Copy `.env.example` to `.env` and fill in the Supabase URL and publishable key to leave demo mode. See `supabase/README.md` for backend setup.

## Layout

- `src/`: the app (React, TypeScript, Vite)
- `supabase/migrations/`: the database; `supabase/functions/`: kid sign-in functions and shared rules
- `public/assets/`: web-sized art; `npm run assets` rebuilds it from the original ChatGPT files
- Earlier ChatGPT prototype: the `first-playable-build` and `qa-next-update` branches (untouched)

## Hosting (Cloudflare)

`wrangler.jsonc` publishes the built app as a Cloudflare Worker named `hahn-heroes` (separate from the other Detcord workers). Simplest setup: in the Cloudflare dashboard, Workers & Pages, Create, import this GitHub repository, build command `npm run build`, deploy command `npx wrangler deploy`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as build variables (the publishable key is meant to be public; never put the service role key or `KID_AUTH_SECRET` there).

## Live Supabase project

The backend runs in the existing `hahn-heroes` Supabase project (org HAHN HEROES, `reccddfusealreknvjfj`, us-east-2). It also holds the earlier prototype's `nexus_*` and `academy_*` tables and functions, which this app does not touch; the app only adds `app_settings`, `app_secrets`, `heroes`, `sign_in_attempts` and `ledger_entries` plus the functions in `supabase/migrations/`. The Supabase free plan allows 2 active projects per account, so a separate project needs a paused or upgraded one.

Public values for the app's build settings (the publishable key is meant to be public):

```
VITE_SUPABASE_URL=https://reccddfusealreknvjfj.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_0lgGi-nNahJtzBObQIbI-A_fwYczmEo
```

`kid-signup` now limits hero creation (60 per network per hour, 400 overall per hour, editable in `app_settings`). Redeploy the function after applying migration `20261005001000`.
