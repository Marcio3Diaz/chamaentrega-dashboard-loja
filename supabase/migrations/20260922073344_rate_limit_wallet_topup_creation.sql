create or replace function public.reserve_store_wallet_topup(
  p_store_id uuid,
  p_wallet_id uuid,
  p_correlation_id text,
  p_amount numeric
)
returns uuid
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_topup_id uuid;
  v_recent_attempts integer;
begin
  if p_store_id is null
     or p_wallet_id is null
     or coalesce(length(trim(p_correlation_id)),0) < 10
     or p_amount is null
     or p_amount < 1
     or p_amount > 5000 then
    raise exception 'INVALID_TOPUP_REQUEST' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_store_id::text, 7321)
  );

  select count(*)
  into v_recent_attempts
  from public.store_wallet_topups t
  where t.store_id=p_store_id
    and t.created_at >= pg_catalog.now() - interval '1 minute';

  if v_recent_attempts >= 3 then
    raise exception 'TOPUP_RATE_LIMITED' using errcode='P0001';
  end if;

  insert into public.store_wallet_topups(
    wallet_id,
    store_id,
    provider,
    correlation_id,
    amount,
    status
  )
  values(
    p_wallet_id,
    p_store_id,
    'woovi',
    trim(p_correlation_id),
    round(p_amount,2),
    'pending'
  )
  returning id into v_topup_id;

  return v_topup_id;
end;
$function$;

revoke all on function public.reserve_store_wallet_topup(uuid,uuid,text,numeric)
from public,anon,authenticated;

grant execute on function public.reserve_store_wallet_topup(uuid,uuid,text,numeric)
to service_role;