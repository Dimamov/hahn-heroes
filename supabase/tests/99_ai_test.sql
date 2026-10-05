-- AI lesson drafts: approved teachers only, with a daily limit and refunds for failed calls.
\set ON_ERROR_STOP on

do $$
declare r jsonb;
begin
  perform as_admin();
  update app_settings set value = '{"limit": 2}' where key = 'ai_daily_limit';

  perform as_user(11);
  perform expect_error($q$select ai_left()$q$, 'approved teachers');
  perform expect_error($q$select ai_claim()$q$, 'approved teachers');

  perform as_user(3);
  assert (ai_left()->>'left')::int = 2, 'two to start';
  assert (ai_claim()->>'ok')::boolean and (ai_claim()->>'left')::int = 0, 'two drafts';
  r := ai_claim();
  assert not (r->>'ok')::boolean and (r->>'left')::int = 0, 'third is refused';
  perform ai_refund();
  assert (ai_left()->>'left')::int = 1, 'a failed call is given back';
  assert (ai_claim()->>'ok')::boolean, 'and can be used again';

  perform as_admin();
  update app_settings set value = '{"limit": 10}' where key = 'ai_daily_limit';
  delete from ai_usage;
end $$;
