create table if not exists public.delivery_location_points (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  courier_id uuid not null references public.couriers(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision check (accuracy_meters is null or accuracy_meters >= 0),
  recorded_at timestamptz not null default now()
);

create index if not exists idx_delivery_location_points_delivery_time
  on public.delivery_location_points(delivery_id, recorded_at);

create index if not exists idx_delivery_location_points_courier_time
  on public.delivery_location_points(courier_id, recorded_at);

alter table public.delivery_location_points enable row level security;

drop policy if exists delivery_location_points_courier_select
  on public.delivery_location_points;
create policy delivery_location_points_courier_select
  on public.delivery_location_points
  for select
  to authenticated
  using (courier_id = (select auth.uid()));

drop policy if exists delivery_location_points_store_select
  on public.delivery_location_points;
create policy delivery_location_points_store_select
  on public.delivery_location_points
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.deliveries d
      join public.stores s on s.id = d.store_id
      where d.id = delivery_location_points.delivery_id
        and s.owner_id = (select auth.uid())
    )
  );

create or replace function public.record_delivery_live_location(
  p_delivery_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid;
  v_delivery_status text;
  v_assigned_courier_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'SESSAO_EXPIRADA' using errcode = 'P0001';
  end if;

  if p_latitude is null
     or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception 'LOCALIZACAO_INVALIDA' using errcode = 'P0001';
  end if;

  if p_accuracy_meters is not null
     and (p_accuracy_meters < 0 or p_accuracy_meters > 500) then
    raise exception 'GPS_IMPRECISO' using errcode = 'P0001';
  end if;

  select d.status, d.assigned_courier_id
    into v_delivery_status, v_assigned_courier_id
  from public.deliveries d
  where d.id = p_delivery_id;

  if not found then
    raise exception 'ENTREGA_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  if v_assigned_courier_id is distinct from v_user_id then
    raise exception 'ENTREGA_NAO_PERTENCE_AO_ENTREGADOR' using errcode = 'P0001';
  end if;

  if v_delivery_status not in (
    'accepted',
    'heading_to_pickup',
    'at_pickup',
    'heading_to_dropoff',
    'at_dropoff'
  ) then
    raise exception 'ENTREGA_NAO_ESTA_ATIVA' using errcode = 'P0001';
  end if;

  update public.couriers
  set
    current_latitude = p_latitude,
    current_longitude = p_longitude,
    last_location_at = now(),
    updated_at = now()
  where id = v_user_id;

  insert into public.delivery_location_points (
    delivery_id,
    courier_id,
    latitude,
    longitude,
    accuracy_meters,
    recorded_at
  )
  values (
    p_delivery_id,
    v_user_id,
    p_latitude,
    p_longitude,
    p_accuracy_meters,
    now()
  );
end;
$function$;

revoke all on function public.record_delivery_live_location(
  uuid, double precision, double precision, double precision
) from public, anon;

grant execute on function public.record_delivery_live_location(
  uuid, double precision, double precision, double precision
) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'delivery_location_points'
  ) then
    alter publication supabase_realtime add table public.delivery_location_points;
  end if;
end $$;
