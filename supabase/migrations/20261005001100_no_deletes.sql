-- Retakes, declined teachers and the sign-up counter no longer delete rows. Marking a row is
-- safer for children's records and keeps a history; old sign-up rows are simply ignored.

alter table public.adults add column declined boolean not null default false;
alter table public.class_submissions add column reset_at timestamptz;

create or replace function public.approve_teacher(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  if p_approve then
    update adults set approved = true, declined = false where id = p_id and role = 'teacher';
  else
    update adults set declined = true where id = p_id and role = 'teacher' and not approved;
  end if;
end $$;

create or replace function public.list_pending_teachers() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'display_name', a.display_name, 'email', u.email)
                                    order by a.created_at)
                     from adults a join auth.users u on u.id = a.id
                    where a.role = 'teacher' and not a.approved and not a.declined), '[]'::jsonb);
end $$;

create or replace function public.sensei_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_role('sensei') then raise exception 'only the Sensei can do this'; end if;
  return jsonb_build_object(
    'heroes', (select count(*) from heroes),
    'grade5', (select count(*) from heroes where grade = 5),
    'grade6', (select count(*) from heroes where grade = 6),
    'parents', (select count(*) from adults where role = 'parent'),
    'teachers', (select count(*) from adults where role = 'teacher' and approved),
    'pending_teachers', (select count(*) from adults where role = 'teacher' and not approved and not declined),
    'classes', (select count(*) from classes),
    'trivia_night', setting('trivia_night'));
end $$;

-- A teacher lets one student try again. The old row stays, marked as reset; the reward key
-- stays too, so a retake can never pay twice.
create or replace function public.teacher_reset_submission(p_mission uuid, p_child uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from class_missions m where m.id = p_mission and teaches_class(m.class_id)) then
    raise exception 'not your class';
  end if;
  update class_submissions set reset_at = now() where mission_id = p_mission and child_id = p_child and reset_at is null;
end $$;

create or replace function public.submit_class_mission(p_mission uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_child uuid := auth.uid();
  v_m class_missions;
  v_key class_mission_keys;
  v_n int;
  v_correct int := 0;
  v_pct int;
  v_coins int := 0;
  v_award jsonb;
  v_review jsonb := '[]'::jsonb;
  v_existing class_submissions;
  v_had boolean;
begin
  select * into v_m from class_missions where id = p_mission;
  if not found or not in_class(v_m.class_id) then raise exception 'mission not found'; end if;
  select * into v_key from class_mission_keys where mission_id = p_mission;
  v_n := jsonb_array_length(v_m.questions);

  select * into v_existing from class_submissions where mission_id = p_mission and child_id = v_child;
  v_had := found;
  if v_had and v_existing.reset_at is null then
    return jsonb_build_object('already_done', true, 'correct', v_existing.correct, 'total', v_existing.total,
      'score_pct', v_existing.score_pct, 'coins', v_existing.coins_awarded);
  end if;

  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> v_n then
    raise exception 'answer every question';
  end if;
  for i in 0 .. v_n - 1 loop
    declare v_right boolean := jsonb_typeof(p_answers -> i) = 'number' and (p_answers ->> i)::int = (v_key.answers ->> i)::int;
    begin
      if v_right then v_correct := v_correct + 1; end if;
      v_review := v_review || jsonb_build_object('correct', v_right, 'right_choice', (v_key.answers ->> i)::int,
                                                 'explanation', v_key.explanations ->> i);
    end;
  end loop;

  v_pct := round(100.0 * v_correct / v_n);
  if v_pct >= 80 then
    v_award := award(v_child, 'coins', greatest(1, round(v_m.max_coins * (v_pct - 50) / 50.0)::int),
                     'class_mission', v_m.title, 'class_mission:' || p_mission);
    v_coins := (v_award ->> 'awarded')::int;
  end if;

  if v_had then
    update class_submissions set answers = p_answers, correct = v_correct, total = v_n, score_pct = v_pct,
           coins_awarded = v_coins, created_at = now(), reset_at = null
     where mission_id = p_mission and child_id = v_child;
  else
    insert into class_submissions (mission_id, child_id, answers, correct, total, score_pct, coins_awarded)
    values (p_mission, v_child, p_answers, v_correct, v_n, v_pct, v_coins);
  end if;

  return jsonb_build_object('already_done', false, 'correct', v_correct, 'total', v_n, 'score_pct', v_pct,
                            'passed', v_pct >= 80, 'coins', v_coins, 'review', v_review);
end $$;

-- Sign-up limit: count the last hour; old rows are ignored instead of cleaned up here.
create or replace function public.check_signup(p_ip text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_limits jsonb := setting('signup_limits');
  v_ip int;
  v_all int;
begin
  select count(*) into v_ip from signup_log where ip is not distinct from p_ip and created_at > now() - interval '1 hour';
  select count(*) into v_all from signup_log where created_at > now() - interval '1 hour';
  if v_ip >= (v_limits ->> 'per_ip_per_hour')::int or v_all >= (v_limits ->> 'global_per_hour')::int then
    return jsonb_build_object('allowed', false, 'retry_after', 600);
  end if;
  insert into signup_log (ip) values (p_ip);
  return jsonb_build_object('allowed', true);
end $$;

revoke execute on function public.teacher_reset_submission(uuid, uuid), public.check_signup(text),
  public.approve_teacher(uuid, boolean) from public, anon, authenticated;
grant execute on function public.teacher_reset_submission(uuid, uuid), public.approve_teacher(uuid, boolean) to authenticated;
grant execute on function public.check_signup(text) to service_role;
