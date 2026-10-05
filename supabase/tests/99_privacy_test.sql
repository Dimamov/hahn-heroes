-- Privacy housekeeping: IP addresses age out, and only the Sensei can delete a hero.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(104, 105) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values
  (u(104), 'PVAAAAA2', 'Priv A', 5, 'ana'), (u(105), 'PVBBBBB2', 'Priv B', 5, 'ana');

do $$
begin
  perform as_admin();
  insert into sign_in_attempts (hero_code, ip, succeeded, attempted_at) values ('OLDIPCOD', '9.9.9.9', false, now() - interval '31 days');
  perform record_sign_in('NEWIPCOD', '9.9.9.8', false);
  assert (select ip from sign_in_attempts where hero_code = 'OLDIPCOD') is null, 'old IP removed';
  assert (select ip from sign_in_attempts where hero_code = 'NEWIPCOD') = '9.9.9.8', 'recent IP kept';
  delete from sign_in_attempts where hero_code in ('OLDIPCOD', 'NEWIPCOD');

  perform award(u(104), 'coins', 5, 'sensei', 'test', 'privtest');
  perform as_user(3);
  perform expect_error($q$select sensei_delete_hero('PVAAAAA2')$q$, 'only the Sensei');
  perform as_user(104);
  perform expect_error($q$select sensei_delete_hero('PVBBBBB2')$q$, 'only the Sensei');
  perform as_user(4);
  perform expect_error($q$select sensei_delete_hero('NOPENOPE')$q$, 'no hero has that code');
  assert sensei_delete_hero('pvaaaaa2') = 'Priv A', 'deleted';
  perform as_admin();
  assert not exists (select 1 from heroes where id = u(104)), 'hero gone';
  assert not exists (select 1 from ledger_entries where child_id = u(104)), 'ledger gone with the hero';
  assert exists (select 1 from heroes where id = u(105)), 'others untouched';
end $$;

delete from auth.users where id = u(105);
