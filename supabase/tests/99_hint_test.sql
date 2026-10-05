-- AI hints: a hero reads only bank questions, with a daily limit and refunds.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(151, 151) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values (u(151), 'HTAAAAA2', 'Hint A', 5, 'ana');

do $$
declare q text; r jsonb; i int;
begin
  perform as_admin();
  select id into q from questions where active limit 1;
  perform as_user(151);
  r := hint_source(q);
  assert r ? 'prompt' and r ? 'choices' and not (r ? 'answer'), 'prompt and choices only, never the answer';
  assert hint_source('no-such-question') is null, 'unknown id';
  for i in 1..6 loop assert (hint_claim()->>'ok')::boolean, 'within the limit'; end loop;
  assert not (hint_claim()->>'ok')::boolean, 'seventh is refused';
  perform hint_refund();
  assert (hint_claim()->>'ok')::boolean, 'refund gives one back';
  perform as_user(3);
  perform expect_error('select hint_claim()', 'not signed in');
  perform as_admin();
  delete from hint_usage;
end $$;

delete from auth.users where id = u(151);
