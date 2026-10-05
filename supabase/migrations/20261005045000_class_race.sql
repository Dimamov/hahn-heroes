-- Class vs class race: classes compete on their total learning points each calendar month. Points are
-- the same capped weekly points the Houses use, so no single hero can carry a class. The scoreboard
-- shows class names only (never heroes), and classes with fewer than the House minimum of members are
-- left off so a tiny class can never single anyone out.
create function public.class_race(p_back int default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_my_class uuid;
  v_month date := (date_trunc('month', school_date(now())) - make_interval(months => least(greatest(coalesce(p_back, 0), 0), 1)))::date;
  v_min int := (setting('house_rules')->>'min_members')::int;
begin
  select class_id into v_my_class from class_members where child_id = me;
  return jsonb_build_object('month', v_month, 'min_members', v_min, 'classes', coalesce((
    with m as (select class_id, count(*) n from class_members group by class_id),
    t as (select cm.class_id, sum(w.pts) total
            from class_members cm join house_weekly() w on w.child_id = cm.child_id
           where date_trunc('month', w.week)::date = v_month group by cm.class_id),
    sc as (select c.id, c.name, c.grade, m.n, coalesce(t.total, 0) total
             from classes c join m on m.class_id = c.id left join t on t.class_id = c.id where m.n >= v_min),
    rk as (select sc.*, rank() over (order by total desc) r from sc)
    select jsonb_agg(jsonb_build_object('name', name, 'grade', grade, 'members', n, 'total', total, 'rank', r, 'mine', id = v_my_class) order by r, name) from rk), '[]'::jsonb));
end $$;

revoke execute on function public.class_race(int) from public, anon;
grant execute on function public.class_race(int) to authenticated;
