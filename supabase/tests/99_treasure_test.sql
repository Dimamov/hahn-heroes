-- Treasure hunt: clues must be found in order, each pays once, the card is claimed once.
\set ON_ERROR_STOP on

insert into auth.users (id, email) select u(n), null from generate_series(130, 130) n;
insert into public.heroes (id, hero_code, display_name, grade, starter_hero) values (u(130), 'THAAAAA2', 'Hunt A', 5, 'ana');

do $$
declare d jsonb := treasure_def(school_week(now())); r jsonb; i int; v_card text := treasure_def(school_week(now()))->>'card';
begin
  perform as_user(130);
  assert (treasure_state()->>'step')::int = 0 and not (treasure_state()->>'done')::boolean, 'starts at zero';
  assert not (treasure_find(d->'places'->>1)->>'ok')::boolean, 'wrong order does nothing';
  assert not (treasure_claim()->>'ok')::boolean, 'nothing to claim yet';
  for i in 0..3 loop
    r := treasure_find(d->'places'->>i);
    assert (r->>'ok')::boolean and (r->>'step')::int = i + 1, 'clue ' || i;
  end loop;
  assert (treasure_state()->>'done')::boolean, 'done';
  assert not (treasure_find(d->'places'->>0)->>'ok')::boolean, 'no more clues';
  assert (treasure_claim()->>'ok')::boolean, 'claims the card';
  assert not (treasure_claim()->>'ok')::boolean, 'only once';
  perform as_admin();
  assert (select qty from hero_cards where hero_id = u(130) and card_id = v_card) = 1, 'card is in the collection';
  assert (select count(*) from ledger_entries where child_id = u(130) and reason = 'Treasure hunt clue') = 4, 'four clue payments';
  delete from hero_cards where hero_id = u(130); delete from treasure_progress where hero_id = u(130);
end $$;

delete from auth.users where id = u(130);
