drop policy if exists deliveries_select_visible on public.deliveries;

create policy deliveries_select_visible
on public.deliveries
for select
to authenticated
using (
  private.current_user_is_admin()
  or assigned_courier_id = (select auth.uid())
  or (
    status = 'available'
    and assigned_courier_id is null
    and (target_courier_id is null or target_courier_id = (select auth.uid()))
    and exists (
      select 1
      from public.couriers courier
      where courier.id = (select auth.uid())
    )
    and private.current_courier_can_accept_delivery()
  )
  or private.current_user_has_store_access(store_id)
);

create or replace function public.get_admin_finance_summary()
returns table(
  booked_revenue numeric,
  paid_revenue numeric,
  receivable_revenue numeric,
  month_revenue numeric,
  delivery_revenue numeric,
  subscription_revenue numeric,
  completed_delivery_count bigint,
  completed_fee_volume numeric
)
language plpgsql
stable
security invoker
set search_path=''
as $function$
begin
  if not private.current_user_is_admin() then
    raise exception 'ADMIN_MFA_REQUIRED' using errcode='42501';
  end if;

  return query
  with revenue as (
    select
      coalesce(sum(e.amount) filter (where e.status <> 'void'),0)::numeric as booked_revenue,
      coalesce(sum(e.amount) filter (where e.status = 'paid'),0)::numeric as paid_revenue,
      coalesce(sum(e.amount) filter (where e.status = 'accrued'),0)::numeric as receivable_revenue,
      coalesce(sum(e.amount) filter (
        where e.status <> 'void'
          and e.occurred_at >= (
            date_trunc('month',now() at time zone 'America/Sao_Paulo')
            at time zone 'America/Sao_Paulo'
          )
      ),0)::numeric as month_revenue,
      coalesce(sum(e.amount) filter (
        where e.status <> 'void'
          and e.revenue_type='delivery_commission'
      ),0)::numeric as delivery_revenue,
      coalesce(sum(e.amount) filter (
        where e.status <> 'void'
          and e.revenue_type='subscription'
      ),0)::numeric as subscription_revenue
    from public.platform_revenue_events e
  ),
  delivery_stats as (
    select
      count(*)::bigint as completed_delivery_count,
      coalesce(sum(d.delivery_fee),0)::numeric as completed_fee_volume
    from public.deliveries d
    where d.status='completed'
  )
  select
    r.booked_revenue,
    r.paid_revenue,
    r.receivable_revenue,
    r.month_revenue,
    r.delivery_revenue,
    r.subscription_revenue,
    d.completed_delivery_count,
    d.completed_fee_volume
  from revenue r
  cross join delivery_stats d;
end;
$function$;

revoke all on function public.get_admin_finance_summary()
from public,anon;
grant execute on function public.get_admin_finance_summary()
to authenticated;

create or replace function public.get_admin_store_finance_summary()
returns table(
  store_id uuid,
  completed_deliveries bigint,
  delivery_base numeric,
  commission numeric,
  subscription_revenue numeric,
  total_revenue numeric
)
language plpgsql
stable
security invoker
set search_path=''
as $function$
begin
  if not private.current_user_is_admin() then
    raise exception 'ADMIN_MFA_REQUIRED' using errcode='42501';
  end if;

  return query
  with delivery_stats as (
    select
      d.store_id,
      count(*)::bigint as completed_deliveries,
      coalesce(sum(d.delivery_fee),0)::numeric as delivery_base
    from public.deliveries d
    where d.status='completed'
    group by d.store_id
  ),
  revenue_stats as (
    select
      e.store_id,
      coalesce(sum(e.amount) filter (
        where e.status <> 'void'
          and e.revenue_type='delivery_commission'
      ),0)::numeric as commission,
      coalesce(sum(e.amount) filter (
        where e.status <> 'void'
          and e.revenue_type='subscription'
      ),0)::numeric as subscription_revenue
    from public.platform_revenue_events e
    where e.store_id is not null
    group by e.store_id
  )
  select
    coalesce(d.store_id,r.store_id) as store_id,
    coalesce(d.completed_deliveries,0)::bigint as completed_deliveries,
    coalesce(d.delivery_base,0)::numeric as delivery_base,
    coalesce(r.commission,0)::numeric as commission,
    coalesce(r.subscription_revenue,0)::numeric as subscription_revenue,
    (
      coalesce(r.commission,0)
      + coalesce(r.subscription_revenue,0)
    )::numeric as total_revenue
  from delivery_stats d
  full outer join revenue_stats r
    on r.store_id=d.store_id;
end;
$function$;

revoke all on function public.get_admin_store_finance_summary()
from public,anon;
grant execute on function public.get_admin_store_finance_summary()
to authenticated;