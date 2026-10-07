-- Talk to the Sensei inside the app: messages, bug reports and ideas go to a private Sensei inbox.
-- Kids never see an email address. The Sensei can thank a hero and grant a diamond reward.
create table public.sensei_messages (
  id bigint generated always as identity primary key,
  hero_id uuid not null references public.heroes (id) on delete cascade,
  kind text not null check (kind in ('message', 'bug', 'idea')),
  body text not null check (char_length(body) between 1 and 500),
  status text not null default 'new' check (status in ('new', 'seen', 'rewarded', 'closed')),
  reward int not null default 0,
  rewards_given int not null default 0,
  reply text check (reply is null or char_length(reply) <= 200),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index sensei_messages_hero_idx on public.sensei_messages (hero_id, created_at desc);
alter table public.sensei_messages enable row level security;
revoke all on public.sensei_messages from anon, authenticated;

create function public.sensei_message_send(p_kind text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_hero uuid := me_hero();
  v_body text := btrim(coalesce(p_body, ''));
begin
  if p_kind not in ('message', 'bug', 'idea') then raise exception 'bad kind'; end if;
  if char_length(v_body) not between 1 and 500 then raise exception 'write 1 to 500 characters'; end if;
  if chat_flagged(v_body) then raise exception 'please use kind words'; end if;
  if (select count(*) from sensei_messages where hero_id = v_hero and created_at > now() - interval '1 day') >= 10 then
    raise exception 'too many messages today';
  end if;
  insert into sensei_messages (hero_id, kind, body) values (v_hero, p_kind, v_body);
end $$;

create function public.sensei_my_messages() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_hero uuid := me_hero();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'body', m.body, 'status', m.status,
             'reward', m.reward, 'reply', m.reply, 'createdAt', m.created_at) order by m.created_at desc)
      from (select * from sensei_messages where hero_id = v_hero order by created_at desc limit 20) m
  ), '[]'::jsonb);
end $$;

create function public.sensei_inbox() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do that'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'body', m.body, 'status', m.status,
             'reward', m.reward, 'reply', m.reply, 'createdAt', m.created_at,
             'hero', h.display_name, 'heroCode', h.hero_code, 'grade', h.grade)
             order by (m.status = 'new') desc, m.created_at desc)
      from (select * from sensei_messages order by (status = 'new') desc, created_at desc limit 60) m
      join heroes h on h.id = m.hero_id
  ), '[]'::jsonb);
end $$;

-- Thank a hero (reward 0) or grant diamonds (1 to 500). Each grant is paid once, through award().
create function public.sensei_message_resolve(p_id bigint, p_reward int, p_reply text, p_close boolean default false) returns jsonb
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
    handled_at = now()
   where id = p_id;
  return v_res;
end $$;

revoke execute on function public.sensei_message_send(text, text), public.sensei_my_messages(), public.sensei_inbox(),
  public.sensei_message_resolve(bigint, int, text, boolean) from public, anon;
grant execute on function public.sensei_message_send(text, text), public.sensei_my_messages(), public.sensei_inbox(),
  public.sensei_message_resolve(bigint, int, text, boolean) to authenticated;

-- The Sensei's announcement about the glitchy Nexus (posted by the Sensei account when one exists).
insert into public.announcements (title, body, created_by)
select 'The Nexus is glitchy!',
  'Heroes, listen up! The Nexus is wobbling and glitches are slipping through. Spot a bug? Tap "The Sensei", then "Report a bug", and tell me what happened. Every bug I confirm earns you a diamond reward! Got a wild idea for a new feature or game? Send it with "Suggest an idea". If I build it into the Nexus, you earn a bigger reward. Help me fix the Nexus, hero!',
  id from public.adults where role = 'sensei' and approved order by created_at limit 1;
