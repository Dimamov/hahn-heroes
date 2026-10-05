-- Every minute: queue the timed messages, then ask the push-send function to deliver whatever is due.
-- The function takes no input, so calling it needs no secret. Skipped quietly where pg_cron or pg_net is missing (local tests).
do $$ begin
  create extension if not exists pg_net with schema extensions;
exception when others then null;
end $$;

create function public.push_tick() returns void
language plpgsql security definer set search_path = public as $$
declare v_url text := setting('push_function_url') #>> '{}';
begin
  perform push_schedule();
  if v_url is not null and to_regnamespace('net') is not null then
    begin
      perform net.http_post(url := v_url, body := '{"action":"send"}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb);
    exception when others then null;
    end;
  end if;
end $$;
revoke execute on function public.push_tick() from public, anon, authenticated;

do $$ begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('hahn-push-tick', '* * * * *', 'select public.push_tick()');
  end if;
exception when others then null;
end $$;
