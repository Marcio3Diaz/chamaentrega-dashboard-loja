create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  source text not null,
  external_order_id text,
  status text not null default 'new',
  fulfillment_type text not null default 'delivery',
  customer_name text,
  customer_phone text,
  delivery_address text,
  delivery_latitude double precision,
  delivery_longitude double precision,
  items jsonb not null default '[]'::jsonb,
  order_total numeric(12,2) not null default 0,
  payment_method text not null default 'unknown',
  payment_status text not null default 'unknown',
  customer_note text,
  delivery_id uuid references public.deliveries(id) on delete set null,
  source_metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_orders_source_check
    check (source in ('whatsapp','ifood','99food','goomer','own_menu','manual')),
  constraint store_orders_status_check
    check (status in ('new','preparing','ready','seeking_courier','in_route','completed','cancelled')),
  constraint store_orders_fulfillment_check
    check (fulfillment_type in ('delivery','pickup')),
  constraint store_orders_payment_status_check
    check (payment_status in ('unknown','pending','paid','failed','refunded')),
  constraint store_orders_items_array_check check (jsonb_typeof(items)='array'),
  constraint store_orders_source_metadata_object_check check (jsonb_typeof(source_metadata)='object'),
  constraint store_orders_total_nonnegative_check check (order_total >= 0)
);

create unique index if not exists uq_store_orders_source_external
  on public.store_orders(store_id,source,external_order_id)
  where external_order_id is not null;

create unique index if not exists uq_store_orders_delivery_id
  on public.store_orders(delivery_id)
  where delivery_id is not null;

create index if not exists idx_store_orders_store_received
  on public.store_orders(store_id,received_at desc);

create index if not exists idx_store_orders_store_status
  on public.store_orders(store_id,status,received_at desc);

create index if not exists idx_store_orders_store_source
  on public.store_orders(store_id,source,received_at desc);

alter table public.store_orders enable row level security;
grant select,insert,update,delete on public.store_orders to authenticated;

drop policy if exists "store_orders_select_owner_admin" on public.store_orders;
create policy "store_orders_select_owner_admin" on public.store_orders
for select to authenticated
using (
  exists (
    select 1 from public.stores s
    where s.id=store_orders.store_id
      and (
        s.owner_id=(select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id=(select auth.uid()) and p.role='admin'
        )
      )
  )
);

drop policy if exists "store_orders_insert_owner_admin" on public.store_orders;
create policy "store_orders_insert_owner_admin" on public.store_orders
for insert to authenticated
with check (
  exists (
    select 1 from public.stores s
    where s.id=store_orders.store_id
      and (
        s.owner_id=(select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id=(select auth.uid()) and p.role='admin'
        )
      )
  )
);

drop policy if exists "store_orders_update_owner_admin" on public.store_orders;
create policy "store_orders_update_owner_admin" on public.store_orders
for update to authenticated
using (
  exists (
    select 1 from public.stores s
    where s.id=store_orders.store_id
      and (
        s.owner_id=(select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id=(select auth.uid()) and p.role='admin'
        )
      )
  )
)
with check (
  exists (
    select 1 from public.stores s
    where s.id=store_orders.store_id
      and (
        s.owner_id=(select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id=(select auth.uid()) and p.role='admin'
        )
      )
  )
);

drop policy if exists "store_orders_delete_owner_admin" on public.store_orders;
create policy "store_orders_delete_owner_admin" on public.store_orders
for delete to authenticated
using (
  exists (
    select 1 from public.stores s
    where s.id=store_orders.store_id
      and (
        s.owner_id=(select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id=(select auth.uid()) and p.role='admin'
        )
      )
  )
);

create or replace function public.set_store_orders_updated_at()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

drop trigger if exists trg_store_orders_updated_at on public.store_orders;
create trigger trg_store_orders_updated_at
before update on public.store_orders
for each row execute function public.set_store_orders_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='store_orders'
  ) then
    alter publication supabase_realtime add table public.store_orders;
  end if;
end $$;
