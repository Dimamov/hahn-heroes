-- Student-made questions: kids write quiz questions for their class, the teacher approves them first, and approved ones
-- can be turned into a class quiz. Words are checked like chat. An approved question earns a small thank-you (Class cap).
insert into public.app_settings (key, value) values ('student_questions', '{"per_week": 5, "approve_coins": 5, "quiz_coins": 30}') on conflict (key) do nothing;

create table public.class_student_questions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  child_id uuid not null references public.heroes (id) on delete cascade,
  prompt text not null check (char_length(prompt) between 5 and 200),
  choices jsonb not null,
  answer int not null check (answer between 0 and 3),
  explanation text not null default '' check (char_length(explanation) <= 200),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  mission_id uuid references public.class_missions (id),
  school_week date not null default school_week(now()),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index class_student_questions_class_idx on public.class_student_questions (class_id, status);
alter table public.class_student_questions enable row level security;
revoke all on public.class_student_questions from anon, authenticated;

create function public.student_q_submit(p_prompt text, p_choices jsonb, p_answer int, p_explanation text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero(); v_class uuid; v_prompt text := btrim(regexp_replace(coalesce(p_prompt, ''), '\s+', ' ', 'g'));
  v_why text := btrim(regexp_replace(coalesce(p_explanation, ''), '\s+', ' ', 'g')); v_n int; c text;
begin
  select class_id into v_class from class_members where child_id = me order by joined_at limit 1;
  if v_class is null then raise exception 'join a class first'; end if;
  if char_length(v_prompt) not between 5 and 200 then raise exception 'write the question in 5 to 200 letters'; end if;
  if jsonb_typeof(p_choices) <> 'array' or jsonb_array_length(p_choices) not between 3 and 4 then raise exception 'give 3 or 4 answers'; end if;
  v_n := jsonb_array_length(p_choices);
  if p_answer is null or p_answer not between 0 and v_n - 1 then raise exception 'pick the right answer'; end if;
  for c in select jsonb_array_elements_text(p_choices) loop
    if char_length(btrim(c)) not between 1 and 60 then raise exception 'each answer is 1 to 60 letters'; end if;
    if chat_flagged(c) then raise exception 'pick different words'; end if;
  end loop;
  if chat_flagged(v_prompt) or chat_flagged(v_why) then raise exception 'pick different words'; end if;
  if v_prompt ~* '(https?:|www\.|@[a-z0-9]|[0-9]{7,})' or v_why ~* '(https?:|www\.|@[a-z0-9]|[0-9]{7,})' then raise exception 'no links or contact details'; end if;
  if (select count(*) from class_student_questions where child_id = me and school_week = school_week(now())) >= (setting('student_questions')->>'per_week')::int then
    raise exception 'that is all your questions for this week';
  end if;
  insert into class_student_questions (class_id, child_id, prompt, choices, answer, explanation)
  values (v_class, me, v_prompt, (select jsonb_agg(btrim(x)) from jsonb_array_elements_text(p_choices) x), p_answer, v_why);
end $$;

-- A student's own questions and what the teacher decided.
create function public.student_q_mine() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'prompt', prompt, 'status', status) order by created_at desc), '[]'::jsonb)
    from class_student_questions where child_id = auth.uid()
$$;

-- Teacher: the questions waiting for a decision and the approved ones not used in a quiz yet.
create function public.student_q_list(p_class uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not teaches_class(p_class) then raise exception 'not your class'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'prompt', q.prompt, 'choices', q.choices, 'answer', q.answer,
      'explanation', q.explanation, 'status', q.status, 'by', h.display_name) order by q.created_at)
    from class_student_questions q join heroes h on h.id = q.child_id
   where q.class_id = p_class and q.mission_id is null and q.status in ('pending', 'approved')), '[]'::jsonb);
end $$;

create function public.student_q_decide(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare q class_student_questions;
begin
  select * into q from class_student_questions where id = p_id for update;
  if q.id is null or not teaches_class(q.class_id) then raise exception 'not your class'; end if;
  if q.status <> 'pending' then return; end if;
  update class_student_questions set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now() where id = p_id;
  if p_approve then perform award(q.child_id, 'coins', (setting('student_questions')->>'approve_coins')::int, 'class_mission', 'Your question was picked', 'sq:' || p_id); end if;
end $$;

-- Teacher: turn up to 10 approved questions into a class quiz (3 needed).
create function public.student_q_make_quiz(p_class uuid, p_title text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; v_mission uuid;
begin
  if not teaches_class(p_class) then raise exception 'not your class'; end if;
  select array_agg(id) into v_ids from (select id from class_student_questions where class_id = p_class and status = 'approved' and mission_id is null order by created_at limit 10) x;
  if coalesce(array_length(v_ids, 1), 0) < 3 then raise exception 'approve at least 3 questions first'; end if;
  v_mission := create_class_mission(p_class, p_title, '',
    (select jsonb_agg(jsonb_build_object('prompt', q.prompt, 'choices', q.choices) order by q.created_at) from class_student_questions q where q.id = any (v_ids)),
    (select jsonb_agg(q.answer order by q.created_at) from class_student_questions q where q.id = any (v_ids)),
    (select jsonb_agg(q.explanation order by q.created_at) from class_student_questions q where q.id = any (v_ids)),
    (setting('student_questions')->>'quiz_coins')::int);
  update class_student_questions set mission_id = v_mission where id = any (v_ids);
  return v_mission;
end $$;

revoke execute on function public.student_q_submit(text, jsonb, int, text), public.student_q_mine(), public.student_q_list(uuid),
  public.student_q_decide(uuid, boolean), public.student_q_make_quiz(uuid, text) from public, anon;
grant execute on function public.student_q_submit(text, jsonb, int, text), public.student_q_mine(), public.student_q_list(uuid),
  public.student_q_decide(uuid, boolean), public.student_q_make_quiz(uuid, text) to authenticated;
