-- AI second look at saved kid chat. The Sensei taps a button; a batch of saved messages that were not checked yet (text only,
-- no names) goes to the chat-review function, and worrying ones come back as flags the Sensei reads and marks reviewed.
-- Nothing is blocked, edited or removed. Capped at 600 messages a day.
create table public.chat_ai_checked (
  kind text not null check (kind in ('room', 'friend')),
  message_id bigint not null,
  flagged boolean not null default false,
  reason text not null default '' check (char_length(reason) <= 120),
  checked_at timestamptz not null default now(),
  reviewed_at timestamptz,
  primary key (kind, message_id)
);
create index chat_ai_checked_flag_idx on public.chat_ai_checked (flagged, reviewed_at);
alter table public.chat_ai_checked enable row level security;
revoke all on public.chat_ai_checked from public, anon, authenticated;

-- Up to 60 saved messages from the last 14 days that have not been checked: key and text only.
create function public.sensei_chat_ai_batch() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  if (select count(*) from chat_ai_checked where checked_at > now() - interval '1 day') >= 600 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('key', x.key, 'body', x.body) order by x.at desc) from (
    select * from (
      select 'r:' || m.id as key, m.body, m.created_at as at from chat_messages m
       where m.created_at > now() - interval '14 days' and not exists (select 1 from chat_ai_checked c where c.kind = 'room' and c.message_id = m.id)
      union all
      select 'f:' || f.id, f.body, f.created_at from friend_messages f
       where f.created_at > now() - interval '14 days' and not exists (select 1 from chat_ai_checked c where c.kind = 'friend' and c.message_id = f.id)
    ) u order by at desc limit 60) x), '[]'::jsonb);
end $$;

-- Saves the answers for a batch: every message in the list becomes checked, flagged ones carry a short reason.
create function public.sensei_chat_ai_save(p_results jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) > 60 then raise exception 'that is not a batch'; end if;
  for r in select * from jsonb_array_elements(p_results) loop
    if (r->>'key') !~ '^[rf]:[0-9]{1,18}$' then continue; end if;
    insert into chat_ai_checked (kind, message_id, flagged, reason)
    values (case when left(r->>'key', 1) = 'r' then 'room' else 'friend' end, substr(r->>'key', 3)::bigint,
            coalesce((r->>'flagged')::boolean, false), left(coalesce(r->>'reason', ''), 120))
    on conflict (kind, message_id) do nothing;
  end loop;
end $$;

-- Flagged messages that have not been reviewed yet, with who wrote them (the Sensei already sees names in chat logs).
create function public.sensei_chat_ai_flags() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  return coalesce((select jsonb_agg(j order by at desc) from (
    select c.checked_at as at, jsonb_build_object('key', c.kind || ':' || c.message_id, 'kind', c.kind, 'name', h.display_name,
             'child_id', m.child_id, 'body', m.body, 'reason', c.reason, 'at', m.created_at) j
      from chat_ai_checked c join chat_messages m on c.kind = 'room' and m.id = c.message_id join heroes h on h.id = m.child_id
     where c.flagged and c.reviewed_at is null
    union all
    select c.checked_at, jsonb_build_object('key', c.kind || ':' || c.message_id, 'kind', c.kind, 'name', h.display_name,
             'child_id', f.sender, 'body', f.body, 'reason', c.reason, 'at', f.created_at)
      from chat_ai_checked c join friend_messages f on c.kind = 'friend' and f.id = c.message_id join heroes h on h.id = f.sender
     where c.flagged and c.reviewed_at is null) z), '[]'::jsonb);
end $$;

create function public.sensei_chat_ai_dismiss(p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  if p_key !~ '^(room|friend):[0-9]{1,18}$' then raise exception 'that is not a message'; end if;
  update chat_ai_checked set reviewed_at = now() where kind = split_part(p_key, ':', 1) and message_id = split_part(p_key, ':', 2)::bigint;
end $$;

revoke execute on function public.sensei_chat_ai_batch(), public.sensei_chat_ai_save(jsonb), public.sensei_chat_ai_flags(), public.sensei_chat_ai_dismiss(text) from public, anon;
grant execute on function public.sensei_chat_ai_batch(), public.sensei_chat_ai_save(jsonb), public.sensei_chat_ai_flags(), public.sensei_chat_ai_dismiss(text) to authenticated;
