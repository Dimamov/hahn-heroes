-- Milestone 3: the learning engine. Questions with a hidden answer key, a per-child history so
-- a child never sees the same question twice, skill tracking, and small rewards that can
-- only be earned once per question.

create type public.question_subject as enum ('math', 'vocab', 'reading', 'science');

create table public.questions (
  id text primary key check (char_length(id) between 3 and 20),
  subject public.question_subject not null,
  grade smallint not null check (grade in (5, 6)),
  skill text not null check (char_length(skill) between 1 and 40),
  difficulty smallint not null check (difficulty between 1 and 3),
  prompt text not null check (char_length(prompt) between 1 and 500),
  choices jsonb not null check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) between 2 and 4),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index questions_pool_idx on public.questions (subject, grade) where active;

-- The answer key lives apart and no policy lets anyone read it.
create table public.question_keys (
  question_id text primary key references public.questions (id) on delete cascade,
  answer smallint not null check (answer between 0 and 3),
  explanation text not null check (char_length(explanation) between 1 and 300)
);

alter table public.questions enable row level security;
alter table public.question_keys enable row level security;
create policy "signed-in people read active questions" on public.questions
  for select to authenticated using (active);
revoke insert, update, delete on public.questions from anon, authenticated;
revoke all on public.question_keys from anon, authenticated;

-- Every question a child has been handed, answered or not. A question is never handed out twice.
create table public.question_history (
  child_id uuid not null references public.heroes (id) on delete cascade,
  question_id text not null references public.questions (id),
  served_at timestamptz not null default now(),
  answered_at timestamptz,
  correct boolean,
  primary key (child_id, question_id)
);
alter table public.question_history enable row level security;
create policy "students read their own history" on public.question_history
  for select to authenticated using (child_id = auth.uid());
revoke insert, update, delete on public.question_history from anon, authenticated;

create table public.skill_stats (
  child_id uuid not null references public.heroes (id) on delete cascade,
  subject public.question_subject not null,
  skill text not null,
  attempts int not null default 0,
  correct int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (child_id, subject, skill)
);
alter table public.skill_stats enable row level security;
create policy "students, parents and teachers read skill stats" on public.skill_stats
  for select to authenticated using (child_id = auth.uid() or public.parent_of(child_id) or public.teaches_child(child_id));
revoke insert, update, delete on public.skill_stats from anon, authenticated;

-- Learning coins are capped each school week like missions; skill points and XP come with
-- every right answer but each question pays once, so the total is bounded by the question pool.
update public.app_settings set value = value || '{"learning": 150}'::jsonb where key = 'weekly_caps';
insert into public.app_settings (key, value) values
  ('learning_rewards', '{"coins": 2, "xp": 5, "skill_points": 1, "set_size": 5, "resume_minutes": 30}');

-- Hands out a set of unseen questions for the hero's own grade. Questions handed out in the last
-- half hour and not yet answered come back first, so a refresh doesn't use up the pool.
create function public.start_practice(p_subject text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_child uuid := auth.uid();
  v_hero heroes;
  v_subject question_subject;
  v_cfg jsonb := setting('learning_rewards');
  v_size int := (v_cfg ->> 'set_size')::int;
  v_ids text[];
  v_have int;
  v_left int;
begin
  select * into v_hero from heroes where id = v_child;
  if not found then raise exception 'only heroes can practice'; end if;
  begin
    v_subject := p_subject::question_subject;
  exception when invalid_text_representation then
    raise exception 'unknown subject';
  end;
  perform pg_advisory_xact_lock(hashtextextended(v_child::text, 1));

  select coalesce(array_agg(h.question_id order by h.served_at), '{}') into v_ids
    from question_history h join questions q on q.id = h.question_id
   where h.child_id = v_child and h.answered_at is null and q.subject = v_subject and q.grade = v_hero.grade
     and h.served_at > now() - make_interval(mins => (v_cfg ->> 'resume_minutes')::int);
  v_have := coalesce(array_length(v_ids, 1), 0);

  if v_have < v_size then
    with fresh as (
      select q.id from questions q
       where q.active and q.subject = v_subject and q.grade = v_hero.grade
         and not exists (select 1 from question_history h where h.child_id = v_child and h.question_id = q.id)
       order by random() limit v_size - v_have
    ), ins as (
      insert into question_history (child_id, question_id) select v_child, id from fresh returning question_id
    )
    select v_ids || coalesce(array_agg(question_id), '{}') into v_ids from ins;
  end if;

  select count(*) into v_left from questions q
   where q.active and q.subject = v_subject and q.grade = v_hero.grade
     and not exists (select 1 from question_history h where h.child_id = v_child and h.question_id = q.id);

  return jsonb_build_object(
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'subject', q.subject, 'skill', q.skill,
                                                              'prompt', q.prompt, 'choices', q.choices)
                                            order by array_position(v_ids, q.id))
                             from questions q where q.id = any (v_ids)), '[]'::jsonb),
    'remaining', v_left);
end $$;

-- Grades one answer on the server. The first answer to a question counts and pays; asking
-- again just shows the same feedback.
create function public.answer_question(p_question text, p_choice int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_child uuid := auth.uid();
  v_hist question_history;
  v_q questions;
  v_key question_keys;
  v_cfg jsonb := setting('learning_rewards');
  v_right boolean;
  v_coins jsonb;
  v_awarded jsonb := '{}'::jsonb;
begin
  select * into v_hist from question_history where child_id = v_child and question_id = p_question for update;
  if not found then raise exception 'that question was not handed to you'; end if;
  select * into v_q from questions where id = p_question;
  select * into v_key from question_keys where question_id = p_question;

  if v_hist.answered_at is not null then
    return jsonb_build_object('correct', v_hist.correct, 'right_choice', v_key.answer,
                              'explanation', v_key.explanation, 'repeat', true);
  end if;
  if p_choice is null or p_choice not between 0 and jsonb_array_length(v_q.choices) - 1 then
    raise exception 'pick one of the choices';
  end if;

  v_right := p_choice = v_key.answer;
  update question_history set answered_at = now(), correct = v_right where child_id = v_child and question_id = p_question;
  insert into skill_stats (child_id, subject, skill, attempts, correct)
  values (v_child, v_q.subject, v_q.skill, 1, case when v_right then 1 else 0 end)
  on conflict (child_id, subject, skill) do update
    set attempts = skill_stats.attempts + 1, correct = skill_stats.correct + excluded.correct, updated_at = now();

  if v_right then
    v_coins := award(v_child, 'coins', (v_cfg ->> 'coins')::int, 'learning', 'Practice: ' || v_q.skill, 'learn:' || p_question);
    perform award(v_child, 'xp', (v_cfg ->> 'xp')::int, 'learning', 'Practice: ' || v_q.skill, 'learn:' || p_question);
    perform award(v_child, 'skill_points', (v_cfg ->> 'skill_points')::int, 'learning', 'Practice: ' || v_q.skill, 'learn:' || p_question);
    v_awarded := jsonb_build_object('coins', v_coins ->> 'awarded', 'xp', (v_cfg ->> 'xp')::int,
                                    'skill_points', (v_cfg ->> 'skill_points')::int, 'capped', (v_coins ->> 'capped')::boolean);
  end if;

  return jsonb_build_object('correct', v_right, 'right_choice', v_key.answer, 'explanation', v_key.explanation,
                            'repeat', false, 'awarded', v_awarded);
end $$;

-- Per subject: how much is answered, how much is left, and which skills are strong or need practice.
create function public.learning_summary(p_child uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'subject', s.subject,
    'answered', (select count(*) from question_history h join questions q on q.id = h.question_id
                  where h.child_id = p_child and q.subject = s.subject and h.answered_at is not null),
    'correct', (select count(*) from question_history h join questions q on q.id = h.question_id
                 where h.child_id = p_child and q.subject = s.subject and h.correct),
    'left', (select count(*) from questions q join heroes hr on hr.id = p_child
              where q.active and q.subject = s.subject and q.grade = hr.grade
                and not exists (select 1 from question_history h where h.child_id = p_child and h.question_id = q.id)),
    'skills', coalesce((select jsonb_agg(jsonb_build_object('skill', k.skill, 'attempts', k.attempts, 'correct', k.correct)
                                         order by k.skill)
                          from skill_stats k where k.child_id = p_child and k.subject = s.subject), '[]'::jsonb)
  ) order by s.subject), '[]'::jsonb)
  from (select unnest(enum_range(null::question_subject)) as subject) s
$$;

create function public.my_learning() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from heroes where id = auth.uid()) then raise exception 'only heroes have a learning record'; end if;
  return learning_summary(auth.uid());
end $$;

create function public.child_learning(p_child uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (parent_of(p_child) or teaches_child(p_child)) then raise exception 'not your child'; end if;
  return learning_summary(p_child);
end $$;

revoke execute on function
  public.start_practice(text), public.answer_question(text, int), public.learning_summary(uuid),
  public.my_learning(), public.child_learning(uuid)
  from public, anon, authenticated;
grant execute on function public.start_practice(text), public.answer_question(text, int),
  public.my_learning(), public.child_learning(uuid) to authenticated;
