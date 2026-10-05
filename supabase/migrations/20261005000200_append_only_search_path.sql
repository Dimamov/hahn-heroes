-- Pin the search path on the append-only trigger function (Supabase security advisor).
alter function public.ledger_is_append_only() set search_path = public;
