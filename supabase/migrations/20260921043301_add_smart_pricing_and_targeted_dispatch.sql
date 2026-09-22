-- Applied to Supabase on 2026-09-21.
-- Adds configurable automatic pricing and targeted smart dispatch.

create table if not exists public.delivery_pricing_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  enabled boolean not null default true,
  minimum_fee numeric(10,2) not null default 7.50 check (minimum_fee >= 0),
  included_km numeric(8,2) not null default 2.00 check (included_km >= 0),
  per_extra_km numeric(10,2) not null default 1.50 check (per_extra_km >= 0),
  road_factor numeric(6,3) not null default 1.250 check (road_factor >= 1),
  round_step numeric(10,2) not null default 0.50 check (round_step > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.delivery_pricing_settings (store_id)
select id from public.stores
on conflict (store_id) do nothing;

alter table public.delivery_pricing_settings enable row level security;

drop policy if exists delivery_pricing_settings_owner_select on public.delivery_pricing_settings;
create policy delivery_pricing_settings_owner_select
on public.delivery_pricing_settings for select to authenticated
using (
  exists (
    select 1 from public.stores s
    where s.id = delivery_pricing_settings.store_id
      and s.owner_id = (select auth.uid())
  )
);

drop policy if exists delivery_pricing_settings_owner_insert on public.delivery_pricing_settings;
create policy delivery_pricing_settings_owner_insert
on public.delivery_pricing_settings for insert to authenticated
with check (
  exists (
    select 1 from public.stores s
    where s.id = delivery_pricing_settings.store_id
      and s.owner_id = (select auth.uid())
  )
);

drop policy if exists delivery_pricing_settings_owner_update on public.delivery_pricing_settings;
create policy delivery_pricing_settings_owner_update
on public.delivery_pricing_settings for update to authenticated
using (
  exists (
    select 1 from public.stores s
    where s.id = delivery_pricing_settings.store_id
      and s.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.stores s
    where s.id = delivery_pricing_settings.store_id
      and s.owner_id = (select auth.uid())
  )
);

alter table public.deliveries
  add column if not exists target_courier_id uuid references public.couriers(id) on delete set null,
  add column if not exists dispatch_route_group_id uuid;

create index if not exists idx_deliveries_target_courier_status
  on public.deliveries(target_courier_id,status);

create index if not exists idx_deliveries_dispatch_route_group
  on public.deliveries(dispatch_route_group_id);

drop policy if exists deliveries_select_visible on public.deliveries;
create policy deliveries_select_visible
on public.deliveries for select to authenticated
using (
  assigned_courier_id = (select auth.uid())
  or (
    status = 'available'
    and assigned_courier_id is null
    and (target_courier_id is null or target_courier_id = (select auth.uid()))
    and exists (
      select 1 from public.couriers courier
      where courier.id = (select auth.uid())
    )
    and private.current_courier_can_accept_delivery()
  )
  or exists (
    select 1
    from public.stores store
    join public.profiles profile on profile.id = store.owner_id
    where store.id = deliveries.store_id
      and store.owner_id = (select auth.uid())
      and profile.role = 'store_owner'
  )
);

create or replace function public.dispatch_route_to_courier(
  p_store_id uuid,
  p_courier_id uuid,
  p_delivery_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner_id uuid := auth.uid();
  v_count integer;
  v_valid_count integer;
  v_group_id uuid := gen_random_uuid();
  v_now timestamptz := pg_catalog.now();
begin
  if v_owner_id is null then
    raise exception 'SESSAO_EXPIRADA' using errcode='P0001';
  end if;

  v_count := coalesce(array_length(p_delivery_ids,1),0);

  if v_count < 1 or v_count > 3 then
    raise exception 'SELECIONE_DE_1_A_3_ENTREGAS' using errcode='P0001';
  end if;

  if not exists (
    select 1 from public.stores s
    where s.id=p_store_id and s.owner_id=v_owner_id
  ) then
    raise exception 'LOJA_NAO_AUTORIZADA' using errcode='P0001';
  end if;

  if not exists (
    select 1
    from public.courier_store_networks n
    join public.couriers c on c.id=n.courier_id
    where n.store_id=p_store_id
      and n.courier_id=p_courier_id
      and n.status='connected'
      and c.is_online=true
      and c.is_available=true
  ) then
    raise exception 'ENTREGADOR_INDISPONIVEL' using errcode='P0001';
  end if;

  select count(*) into v_valid_count
  from public.deliveries d
  where d.id=any(p_delivery_ids)
    and d.store_id=p_store_id
    and d.assigned_courier_id is null
    and d.status in ('draft','available','negotiating');

  if v_valid_count <> v_count then
    raise exception 'ENTREGA_INVALIDA_OU_JA_ATRIBUIDA' using errcode='P0001';
  end if;

  update public.deliveries
  set status='available',
      target_courier_id=p_courier_id,
      dispatch_route_group_id=v_group_id,
      published_at=v_now,
      ready_at=coalesce(ready_at,v_now),
      expires_at=v_now + interval '5 minutes',
      seconds_to_accept=300
  where id=any(p_delivery_ids)
    and store_id=p_store_id;

  return v_group_id;
end;
$function$;

revoke all on function public.dispatch_route_to_courier(uuid,uuid,uuid[]) from public, anon;
grant execute on function public.dispatch_route_to_courier(uuid,uuid,uuid[]) to authenticated;
