create or replace function public.admin_register_subscription_payment(
  p_subscription_id uuid
)
returns public.store_subscriptions
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_subscription public.store_subscriptions%rowtype;
  v_now timestamptz := now();
  v_next timestamptz;
begin
  if not private.current_user_is_admin() then
    raise exception 'ADMIN_MFA_REQUIRED' using errcode='42501';
  end if;

  select *
  into v_subscription
  from public.store_subscriptions
  where id=p_subscription_id
  for update;

  if not found then
    raise exception 'SUBSCRIPTION_NOT_FOUND' using errcode='P0001';
  end if;

  if coalesce(v_subscription.monthly_amount,0) <= 0 then
    raise exception 'SUBSCRIPTION_AMOUNT_REQUIRED' using errcode='22023';
  end if;

  v_next := coalesce(v_subscription.next_billing_at,v_now) + interval '1 month';

  insert into public.platform_revenue_events(
    store_id,
    subscription_id,
    revenue_type,
    gross_reference_amount,
    rate_percent,
    amount,
    status,
    description,
    occurred_at
  )
  values(
    v_subscription.store_id,
    v_subscription.id,
    'subscription',
    v_subscription.monthly_amount,
    null,
    v_subscription.monthly_amount,
    'paid',
    'Assinatura — ' || left(v_subscription.plan_name,180),
    v_now
  );

  update public.store_subscriptions
  set
    last_billed_at=v_now,
    next_billing_at=v_next,
    status=case
      when status='inactive' then 'active'
      else status
    end,
    updated_at=v_now
  where id=v_subscription.id
  returning * into v_subscription;

  return v_subscription;
end;
$function$;

revoke all on function public.admin_register_subscription_payment(uuid)
from public,anon;
grant execute on function public.admin_register_subscription_payment(uuid)
to authenticated;
