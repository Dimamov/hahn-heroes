-- A hero's own weekly recap (the same numbers their parent and teacher see).
create function public.my_week(p_weeks_back int default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_week date := school_week(now() - make_interval(days => 7 * greatest(0, least(coalesce(p_weeks_back, 0), 12))));
begin
  return jsonb_build_object(
    'week_start', v_week,
    'days_active', (select count(distinct school_date(h.answered_at)) from question_history h
                     where h.child_id = me and h.answered_at is not null and school_week(h.answered_at) = v_week),
    'answered', (select count(*) from question_history h
                  where h.child_id = me and h.answered_at is not null and school_week(h.answered_at) = v_week),
    'correct', (select count(*) from question_history h
                 where h.child_id = me and h.correct and school_week(h.answered_at) = v_week),
    'subjects', coalesce((select jsonb_agg(jsonb_build_object('subject', s.subject, 'answered', s.n, 'correct', s.c) order by s.subject)
                  from (select q.subject, count(*) n, count(*) filter (where h.correct) c
                          from question_history h join questions q on q.id = h.question_id
                         where h.child_id = me and h.answered_at is not null and school_week(h.answered_at) = v_week
                         group by q.subject) s), '[]'::jsonb),
    'points', coalesce((select sum(amount) from ledger_entries
                         where child_id = me and currency = 'coins' and amount > 0 and school_week = v_week), 0),
    'missions', (select count(*) from ledger_entries
                  where child_id = me and currency = 'coins' and amount > 0 and school_week = v_week
                    and source in ('home_mission', 'class_mission')));
end $$;

revoke execute on function public.my_week(int) from public, anon;
grant execute on function public.my_week(int) to authenticated;
