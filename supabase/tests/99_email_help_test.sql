-- "Didn't get the email?": anyone can ask, only the address and time are kept, only the Sensei reads and closes them.
\set ON_ERROR_STOP on

do $$
declare r jsonb; i int; v_id bigint;
begin
  reset role; set role anon;
  assert (email_help_request('not an email')->>'bad_email')::boolean, 'bad address refused';
  assert (email_help_request('Mom@Example.com ')->>'ok')::boolean, 'request taken';
  perform email_help_request('mom@example.com');
  perform email_help_request('mom@example.com');
  r := email_help_request('mom@example.com');
  assert (r->>'already')::boolean, 'fourth request in an hour is quietly absorbed';
  reset role;
  assert (select count(*) from email_help_requests where email = 'mom@example.com') = 3, 'three saved, address lowercased';

  -- a request from anon can't read the list
  set role anon;
  perform expect_error($q$select sensei_email_requests()$q$, 'permission denied');
  reset role;

  perform as_user(2);
  perform expect_error($q$select sensei_email_requests()$q$, 'only the Sensei');
  perform expect_error($q$select sensei_email_request_done(1)$q$, 'only the Sensei');

  perform as_user(4);
  r := sensei_email_requests();
  assert jsonb_array_length(r) = 3, 'sensei sees open requests';
  v_id := (r->0->>'id')::bigint;
  perform sensei_email_request_done(v_id);
  assert jsonb_array_length(sensei_email_requests()) = 0, 'done closes every request from that address';
  perform as_admin();
  assert (select count(*) from email_help_requests) = 3, 'nothing deleted';
end $$;
