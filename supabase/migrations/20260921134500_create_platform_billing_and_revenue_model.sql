-- Separate platform revenue from store wallet accounting.
-- Admin finance tracks subscriptions and ChamaEntrega commission revenue.

create table if not exists public.platform_billing_settings (
  id smallint primary key default 1 check (id = 1),
  commission_enabled boolean not null default false,
  delivery_commission_percent numeric(5,2) not null default 0
    check (delivery_commission_percent >= 0 and delivery_commission_percent <= 100),
  subscriptions_enabled boolean not null default false,
  default_subscription_amount numeric(12,2) not null default 0
    check (default_subscription_amount >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.platform_billing_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.store_subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null unique references public.stores(id) on delete cascade,
  plan_name text not null default 'Plano ChamaEntrega',
  monthly_amount numeric(12,2) not null default 0 check (monthly_amount >= 0),
  status text not null default 'inactive'
    check (status in ('inactive','trialing','active','paused','cancelled')),
  started_at timestamptz,
  next_billing_at timestamptz,
  last_billed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.store_subscriptions (store_id,plan_name,monthly_amount,status)
select s.id,'Sem plano',0,'inactive'
from public.stores s
on conflict (store_id) do nothing;

create table if not exists public.platform_revenue_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete set null,
  delivery_id uuid references public.deliveries(id) on delete set null,
  subscription_id uuid references public.store_subscriptions(id) on delete set null,
  revenue_type text not null
    check (revenue_type in ('delivery_commission','subscription','adjustment')),
  gross_reference_amount numeric(12,2) not null default 0,
  rate_percent numeric(5,2),
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'accrued'
    check (status in ('accrued','paid','void')),
  description text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists uq_platform_revenue_delivery_type
on public.platform_revenue_events(delivery_id,revenue_type)
where delivery_id is not null;

create index if not exists idx_platform_revenue_events_occurred_at
on public.platform_revenue_events(occurred_at desc);

create index if not exists idx_platform_revenue_events_store_id
on public.platform_revenue_events(store_id);

alter table public.platform_billing_settings enable row level security;
alter table public.store_subscriptions enable row level security;
alter table public.platform_revenue_events enable row level security;

drop policy if exists platform_billing_settings_admin_all on public.platform_billing_settings;
create policy platform_billing_settings_admin_all
on public.platform_billing_settings
for all to authenticated
using (private.current_user_is_admin())
with check (private.current_user_is_admin());

drop policy if exists store_subscriptions_admin_all on public.store_subscriptions;
create policy store_subscriptions_admin_all
on public.store_subscriptions
for all to authenticated
using (private.current_user_is_admin())
with check (private.current_user_is_admin());

drop policy if exists platform_revenue_events_admin_all on public.platform_revenue_events;
create policy platform_revenue_events_admin_all
on public.platform_revenue_events
for all to authenticated
using (private.current_user_is_admin())
with check (private.current_user_is_admin());

create or replace function public.record_platform_delivery_commission()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_enabled boolean;
  v_percent numeric(5,2);
  v_amount numeric(12,2);
begin
  if new.status <> 'completed' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'completed' and old.delivery_fee = new.delivery_fee then
    return new;
  end if;

  select commission_enabled,delivery_commission_percent
    into v_enabled,v_percent
  from public.platform_billing_settings
  where id=1;

  if coalesce(v_enabled,false) = false or coalesce(v_percent,0) <= 0 then
    return new;
  end if;

  v_amount := round((coalesce(new.delivery_fee,0) * v_percent / 100.0)::numeric,2);

  if v_amount <= 0 then
    return new;
  end if;

  insert into public.platform_revenue_events (
    store_id,
    delivery_id,
    revenue_type,
    gross_reference_amount,
    rate_percent,
    amount,
    status,
    description,
    occurred_at
  )
  values (
    new.store_id,
    new.id,
    'delivery_commission',
    new.delivery_fee,
    v_percent,
    v_amount,
    'accrued',
    'Comissão sobre entrega concluída',
    coalesce(new.completed_at,now())
  )
  on conflict (delivery_id,revenue_type) where delivery_id is not null
  do update set
    gross_reference_amount=excluded.gross_reference_amount,
    rate_percent=excluded.rate_percent,
    amount=excluded.amount,
    description=excluded.description,
    occurred_at=excluded.occurred_at;

  return new;
end;
$function$;

drop trigger if exists trg_record_platform_delivery_commission on public.deliveries;
create trigger trg_record_platform_delivery_commission
after insert or update of status,delivery_fee
on public.deliveries
for each row
execute function public.record_platform_delivery_commission();
