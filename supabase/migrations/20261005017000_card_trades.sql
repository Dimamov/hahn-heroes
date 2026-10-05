-- Trading. Both children see both sides, confirm the same exact version of the offer, and the server then
-- moves every card in one step. Any change to either side starts a new version and clears both confirmations.
create function public.trade_value(p_offer jsonb, p_receiver uuid) returns numeric
language sql stable security definer set search_path = public as $$
  -- A card the receiver already owns is worth half as much to them.
  select coalesce(sum(rarity_value(d.rarity) * (o->>'qty')::int
           * case when exists (select 1 from hero_cards h where h.hero_id = p_receiver and h.card_id = d.id and h.qty > 0) then 0.5 else 1 end), 0)
    from jsonb_array_elements(p_offer) o join card_defs d on d.id = o->>'card'
$$;

-- level: empty (nothing offered), blocked (one-sided or extremely lopsided), uneven (warn both), ok.
create function public.trade_fairness(t card_trades) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  va numeric := trade_value(t.offer_a, t.b);
  vb numeric := trade_value(t.offer_b, t.a);
  hi numeric := greatest(va, vb);
  lo numeric := least(va, vb);
  v_level text;
begin
  v_level := case
    when hi = 0 then 'empty'
    when lo = 0 then 'blocked'
    when hi / lo >= 4 and hi - lo >= 6 then 'blocked'
    when hi / lo >= 1.5 and hi - lo >= 2 then 'uneven'
    else 'ok' end;
  return jsonb_build_object('level', v_level, 'giving_more', case when va > vb then 'a' when vb > va then 'b' else null end);
end $$;

create function public.trade_open(p_friend uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  v_id uuid;
begin
  if p_friend is null or p_friend = me or not exists (
    select 1 from friendships f where f.status = 'accepted' and ((f.a = me and f.b = p_friend) or (f.b = me and f.a = p_friend))
  ) then raise exception 'you can only trade with friends'; end if;
  select id into v_id from card_trades where status = 'open' and least(a, b) = least(me, p_friend) and greatest(a, b) = greatest(me, p_friend);
  if v_id is null then
    insert into card_trades (a, b) values (me, p_friend) returning id into v_id;
  end if;
  return v_id;
end $$;

-- Replaces my side of the offer with these cards, e.g. [{"card": "c-lamp", "qty": 1}].
create function public.trade_set(p_trade uuid, p_offer jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  t card_trades;
  o jsonb;
  v_seen text[] := '{}';
  v_total int := 0;
  v_qty int;
begin
  select * into t from card_trades where id = p_trade for update;
  if t.id is null or me not in (t.a, t.b) then raise exception 'not your trade'; end if;
  if t.status <> 'open' then raise exception 'this trade is closed'; end if;
  if jsonb_typeof(p_offer) <> 'array' then raise exception 'offer is not valid'; end if;
  for o in select jsonb_array_elements(p_offer) loop
    if jsonb_typeof(o->'qty') <> 'number' or jsonb_typeof(o->'card') <> 'string' then raise exception 'offer is not valid'; end if;
    v_qty := (o->>'qty')::numeric::int;
    if v_qty <> (o->>'qty')::numeric or v_qty < 1 or v_qty > 5 or (o->>'card') = any (v_seen) then raise exception 'offer is not valid'; end if;
    if not exists (select 1 from hero_cards where hero_id = me and card_id = o->>'card' and qty >= v_qty) then raise exception 'you do not have those cards'; end if;
    v_seen := v_seen || (o->>'card');
    v_total := v_total + v_qty;
  end loop;
  if v_total > 6 then raise exception 'a trade can hold up to 6 cards per side'; end if;
  update card_trades set
    offer_a = case when me = a then (select coalesce(jsonb_agg(jsonb_build_object('card', x->>'card', 'qty', (x->>'qty')::int) order by x->>'card'), '[]') from jsonb_array_elements(p_offer) x) else offer_a end,
    offer_b = case when me = b then (select coalesce(jsonb_agg(jsonb_build_object('card', x->>'card', 'qty', (x->>'qty')::int) order by x->>'card'), '[]') from jsonb_array_elements(p_offer) x) else offer_b end,
    ver = ver + 1, conf_a = 0, conf_b = 0, updated_at = now()
  where id = p_trade;
end $$;

create function public.trade_view(p_trade uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  t card_trades;
  v_mine boolean;
begin
  select * into t from card_trades where id = p_trade;
  if t.id is null or me not in (t.a, t.b) then raise exception 'not your trade'; end if;
  v_mine := me = t.a;
  return jsonb_build_object(
    'id', t.id, 'status', t.status, 'ver', t.ver,
    'friend', (select display_name from heroes where id = case when v_mine then t.b else t.a end),
    'friend_id', case when v_mine then t.b else t.a end,
    'my_offer', case when v_mine then t.offer_a else t.offer_b end,
    'their_offer', case when v_mine then t.offer_b else t.offer_a end,
    'i_confirmed', (case when v_mine then t.conf_a else t.conf_b end) = t.ver,
    'they_confirmed', (case when v_mine then t.conf_b else t.conf_a end) = t.ver,
    'fairness', (trade_fairness(t) || jsonb_build_object('i_give_more', (trade_fairness(t)->>'giving_more') = case when v_mine then 'a' else 'b' end)));
end $$;

create function public.trade_confirm(p_trade uuid, p_ver int, p_ack boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := me_hero();
  t card_trades;
  v_fair jsonb;
  o jsonb;
begin
  select * into t from card_trades where id = p_trade for update;
  if t.id is null or me not in (t.a, t.b) then raise exception 'not your trade'; end if;
  if t.status <> 'open' then raise exception 'this trade is closed'; end if;
  if t.ver <> p_ver then return jsonb_build_object('ok', false, 'reason', 'changed'); end if;
  v_fair := trade_fairness(t);
  if v_fair->>'level' in ('empty', 'blocked') then raise exception 'this trade is too lopsided'; end if;
  if v_fair->>'level' = 'uneven' and not coalesce(p_ack, false) then raise exception 'please confirm the uneven trade'; end if;
  update card_trades set conf_a = case when me = a then ver else conf_a end, conf_b = case when me = b then ver else conf_b end where id = p_trade
  returning * into t;
  if t.conf_a <> t.ver or t.conf_b <> t.ver then return jsonb_build_object('ok', true, 'done', false); end if;

  -- Both confirmed this exact version: check ownership again, then move everything together.
  perform pg_advisory_xact_lock(hashtextextended(least(t.a, t.b)::text, 10));
  perform pg_advisory_xact_lock(hashtextextended(greatest(t.a, t.b)::text, 10));
  for o in select jsonb_array_elements(t.offer_a) loop
    if not exists (select 1 from hero_cards where hero_id = t.a and card_id = o->>'card' and qty >= (o->>'qty')::int) then
      update card_trades set conf_a = 0, conf_b = 0 where id = p_trade;
      return jsonb_build_object('ok', false, 'reason', 'missing_cards');
    end if;
  end loop;
  for o in select jsonb_array_elements(t.offer_b) loop
    if not exists (select 1 from hero_cards where hero_id = t.b and card_id = o->>'card' and qty >= (o->>'qty')::int) then
      update card_trades set conf_a = 0, conf_b = 0 where id = p_trade;
      return jsonb_build_object('ok', false, 'reason', 'missing_cards');
    end if;
  end loop;
  if trade_fairness(t)->>'level' in ('empty', 'blocked') then
    update card_trades set conf_a = 0, conf_b = 0 where id = p_trade;
    return jsonb_build_object('ok', false, 'reason', 'blocked');
  end if;
  for o in select jsonb_array_elements(t.offer_a) loop
    update hero_cards set qty = qty - (o->>'qty')::int where hero_id = t.a and card_id = o->>'card';
    insert into hero_cards (hero_id, card_id, qty) values (t.b, o->>'card', (o->>'qty')::int)
    on conflict (hero_id, card_id) do update set qty = hero_cards.qty + excluded.qty;
  end loop;
  for o in select jsonb_array_elements(t.offer_b) loop
    update hero_cards set qty = qty - (o->>'qty')::int where hero_id = t.b and card_id = o->>'card';
    insert into hero_cards (hero_id, card_id, qty) values (t.a, o->>'card', (o->>'qty')::int)
    on conflict (hero_id, card_id) do update set qty = hero_cards.qty + excluded.qty;
  end loop;
  update card_trades set status = 'done', updated_at = now() where id = p_trade;
  return jsonb_build_object('ok', true, 'done', true);
end $$;

create function public.trade_cancel(p_trade uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  update card_trades set status = 'cancelled', updated_at = now() where id = p_trade and me in (a, b) and status = 'open';
end $$;

-- My open trades, so a friend's request shows up on my side.
create function public.trade_list() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := me_hero();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'friend', h.display_name, 'friend_id', h.id, 'started_by_me', t.a = me) order by t.updated_at desc)
    from card_trades t join heroes h on h.id = case when t.a = me then t.b else t.a end
   where t.status = 'open' and me in (t.a, t.b)), '[]'::jsonb);
end $$;

revoke execute on function public.rarity_value(public.card_rarity), public.packs_available(uuid), public.trade_value(jsonb, uuid), public.trade_fairness(card_trades) from public, anon, authenticated;
revoke execute on function public.cards_state(), public.card_open_pack(), public.card_set_showcase(jsonb), public.sensei_give_card(text, text),
  public.trade_open(uuid), public.trade_set(uuid, jsonb), public.trade_view(uuid), public.trade_confirm(uuid, int, boolean), public.trade_cancel(uuid), public.trade_list() from public, anon;
grant execute on function public.cards_state(), public.card_open_pack(), public.card_set_showcase(jsonb), public.sensei_give_card(text, text),
  public.trade_open(uuid), public.trade_set(uuid, jsonb), public.trade_view(uuid), public.trade_confirm(uuid, int, boolean), public.trade_cancel(uuid), public.trade_list() to authenticated;
