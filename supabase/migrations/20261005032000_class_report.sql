-- Teacher progress report: one class, one school week, one row per student.
-- p_weeks_back = 0 is this school week (Monday to Sunday), 1 is last week. Teachers only, own classes only.
create function public.class_report(p_class uuid, p_weeks_back int default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_week date := school_week(now() - make_interval(days => 7 * greatest(0, least(coalesce(p_weeks_back, 0), 12))));
begin
  if not teaches_class(p_class) then raise exception 'not your class'; end if;
  return jsonb_build_object(
    'week_start', v_week,
    'class_name', (select name from classes where id = p_class),
    'students', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.child_id, 'name', hh.display_name,
        'days_active', (select count(distinct school_date(h.answered_at)) from question_history h
                         where h.child_id = m.child_id and h.answered_at is not null and school_week(h.answered_at) = v_week),
        'answered', (select count(*) from question_history h
                      where h.child_id = m.child_id and h.answered_at is not null and school_week(h.answered_at) = v_week),
        'correct', (select count(*) from question_history h
                     where h.child_id = m.child_id and h.correct and school_week(h.answered_at) = v_week),
        'points', coalesce((select sum(amount) from ledger_entries
                             where child_id = m.child_id and currency = 'coins' and amount > 0 and school_week = v_week), 0),
        'missions', (select count(*) from ledger_entries
                      where child_id = m.child_id and currency = 'coins' and amount > 0 and school_week = v_week
                        and source in ('home_mission', 'class_mission'))
      ) order by hh.display_name)
      from class_members m join heroes hh on hh.id = m.child_id where m.class_id = p_class), '[]'::jsonb));
end $$;

revoke execute on function public.class_report(uuid, int) from public, anon;
grant execute on function public.class_report(uuid, int) to authenticated;
