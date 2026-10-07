-- The Sensei's messages take over the screen once: replies and rewards are marked seen by the hero.
-- The Sensei also gets a push notification when a hero writes to the inbox.
alter table public.sensei_messages add column hero_seen_at timestamptz;

drop function public.sensei_my_messages();
create function public.sensei_my_messages() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_hero uuid := me_hero();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'body', m.body, 'status', m.status,
             'reward', m.reward, 'reply', m.reply, 'createdAt', m.created_at,
             'unseen', (m.handled_at is not null and m.hero_seen_at is null and (m.reply is not null or m.reward > 0)))
             order by m.created_at desc)
      from (select * from sensei_messages where hero_id = v_hero order by created_at desc limit 20) m
  ), '[]'::jsonb);
end $$;

create function public.sensei_replies_seen() returns void
language plpgsql security definer set search_path = public as $$
begin
  update sensei_messages set hero_seen_at = now() where hero_id = me_hero() and handled_at is not null and hero_seen_at is null;
end $$;

create or replace function public.sensei_message_resolve(p_id bigint, p_reward int, p_reply text, p_close boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m sensei_messages;
  v_reply text := nullif(btrim(coalesce(p_reply, '')), '');
  v_res jsonb := jsonb_build_object('awarded', 0);
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do that'; end if;
  if p_reward is null or p_reward not between 0 and 500 then raise exception 'reward must be 0 to 500'; end if;
  select * into m from sensei_messages where id = p_id for update;
  if not found then raise exception 'no such message'; end if;
  if p_reward > 0 then
    v_res := award(m.hero_id, 'coins', p_reward, 'sensei', 'Sensei reward', 'sensei_msg:' || m.id || ':' || (m.rewards_given + 1));
  end if;
  update sensei_messages set
    status = case when p_reward > 0 then 'rewarded' when p_close then 'closed' else 'seen' end,
    reward = reward + coalesce((v_res->>'awarded')::int, 0),
    rewards_given = rewards_given + case when p_reward > 0 then 1 else 0 end,
    reply = coalesce(v_reply, reply),
    handled_at = now(),
    hero_seen_at = null
   where id = p_id;
  return v_res;
end $$;

revoke execute on function public.sensei_my_messages(), public.sensei_replies_seen() from public, anon;
grant execute on function public.sensei_my_messages(), public.sensei_replies_seen() to authenticated;

-- Push to the Sensei for each new hero message (no names, no text). Needs the Sensei to turn notifications on.
create function public.push_on_sensei_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  for u in select id from adults where role = 'sensei' and approved loop
    perform push_enqueue(u, 'sensei_message', case new.kind when 'bug' then 'New bug report 🐞' when 'idea' then 'New idea 💡' else 'New message 🧙' end,
      'A hero wrote to you. Open the Sensei inbox.', 'sm:' || new.id || ':' || u);
  end loop;
  return null;
end $$;
create trigger sensei_messages_push after insert on public.sensei_messages
  for each row execute function public.push_on_sensei_message();

-- The Sensei does not need a push for their own announcements.
create or replace function public.push_on_announcement() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  for u in select p.user_id from push_prefs p where p.sensei_message and not exists (select 1 from adults a where a.id = p.user_id and a.role = 'sensei') loop
    perform push_enqueue(u, 'sensei_message', new.title, 'New message from the Sensei', 'an:' || new.id || ':' || u);
  end loop;
  return null;
end $$;
