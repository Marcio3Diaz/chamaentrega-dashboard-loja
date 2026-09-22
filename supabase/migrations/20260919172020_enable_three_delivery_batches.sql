create or replace function public.current_courier_can_accept_delivery()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.couriers as courier
      where courier.id = auth.uid()
        and courier.is_online = true
        and courier.is_available = true
    )
    and not exists (
      select 1
      from public.courier_delivery_batches as batch
      where batch.courier_id = auth.uid()
        and batch.status = 'locked'
    )
    and (
      select count(*)
      from public.deliveries as delivery
      where delivery.assigned_courier_id = auth.uid()
        and delivery.status in (
          'accepted',
          'heading_to_pickup',
          'at_pickup',
          'heading_to_dropoff',
          'at_dropoff'
        )
    ) < 3;
$$;

revoke all on function public.current_courier_can_accept_delivery()
  from public, anon;
grant execute on function public.current_courier_can_accept_delivery()
  to authenticated;

create or replace function public.refresh_courier_delivery_batch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_courier_id uuid;
  v_total_deliveries integer;
  v_active_deliveries integer;
  v_max_deliveries integer;
  v_next_batch_status text;
begin
  if new.courier_batch_id is null then
    return new;
  end if;

  select
    batch.courier_id,
    batch.max_deliveries
  into
    v_courier_id,
    v_max_deliveries
  from public.courier_delivery_batches as batch
  where batch.id = new.courier_batch_id;

  if not found then
    return new;
  end if;

  select
    count(*),
    count(*) filter (
      where delivery.status in (
        'accepted',
        'heading_to_pickup',
        'at_pickup',
        'heading_to_dropoff',
        'at_dropoff'
      )
    )
  into
    v_total_deliveries,
    v_active_deliveries
  from public.deliveries as delivery
  where delivery.courier_batch_id = new.courier_batch_id;

  v_next_batch_status :=
    case
      when v_active_deliveries = 0 then 'completed'
      when v_total_deliveries >= v_max_deliveries then 'locked'
      else 'open'
    end;

  update public.courier_delivery_batches
  set
    status = v_next_batch_status,
    completed_at = case
      when v_next_batch_status = 'completed'
        then coalesce(completed_at, pg_catalog.now())
      else null
    end
  where id = new.courier_batch_id;

  update public.couriers as courier
  set is_available =
    case
      when courier.is_online = false then false
      when v_next_batch_status = 'locked' then false
      else true
    end
  where courier.id = v_courier_id;

  return new;
end;
$$;

create or replace function public.accept_delivery_with_batch_limit(
  p_delivery_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_courier_id uuid := auth.uid();
  v_batch_id uuid;
  v_batch_status text;
  v_batch_max_deliveries integer;
  v_total_deliveries integer := 0;
  v_active_deliveries integer := 0;
  v_is_online boolean;
  v_is_available boolean;
begin
  if v_courier_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Sua sessão expirou. Entre novamente.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_courier_id::text)
  );

  update public.courier_delivery_batches as batch
  set
    status = 'completed',
    completed_at = coalesce(batch.completed_at, pg_catalog.now())
  where batch.courier_id = v_courier_id
    and batch.status in ('open', 'locked')
    and not exists (
      select 1
      from public.deliveries as delivery
      where delivery.courier_batch_id = batch.id
        and delivery.status in (
          'accepted',
          'heading_to_pickup',
          'at_pickup',
          'heading_to_dropoff',
          'at_dropoff'
        )
    );

  update public.couriers as courier
  set is_available =
    courier.is_online
    and not exists (
      select 1
      from public.courier_delivery_batches as batch
      where batch.courier_id = v_courier_id
        and batch.status = 'locked'
    )
  where courier.id = v_courier_id
  returning courier.is_online, courier.is_available
  into v_is_online, v_is_available;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Cadastro de entregador não encontrado.';
  end if;

  if v_is_online is distinct from true then
    raise exception using
      errcode = 'P0001',
      message = 'Fique online para aceitar novas entregas.';
  end if;

  select count(*)
  into v_active_deliveries
  from public.deliveries as delivery
  where delivery.assigned_courier_id = v_courier_id
    and delivery.status in (
      'accepted',
      'heading_to_pickup',
      'at_pickup',
      'heading_to_dropoff',
      'at_dropoff'
    );

  if v_active_deliveries >= 3 then
    raise exception using
      errcode = 'P0001',
      message = 'Você atingiu o limite de 3 entregas no lote atual.';
  end if;

  select
    batch.id,
    batch.status,
    batch.max_deliveries
  into
    v_batch_id,
    v_batch_status,
    v_batch_max_deliveries
  from public.courier_delivery_batches as batch
  where batch.courier_id = v_courier_id
    and batch.status in ('open', 'locked')
  for update;

  if found then
    if v_batch_status = 'locked' then
      raise exception using
        errcode = 'P0001',
        message = 'O lote atual já atingiu o limite de 3 entregas.';
    end if;

    if v_batch_max_deliveries < 3 then
      update public.courier_delivery_batches
      set max_deliveries = 3
      where id = v_batch_id;

      v_batch_max_deliveries := 3;
    end if;

    select count(*)
    into v_total_deliveries
    from public.deliveries as delivery
    where delivery.courier_batch_id = v_batch_id;

    if v_total_deliveries >= v_batch_max_deliveries then
      raise exception using
        errcode = 'P0001',
        message = 'O lote atual já atingiu o limite de 3 entregas.';
    end if;
  else
    insert into public.courier_delivery_batches (
      courier_id,
      status,
      max_deliveries
    )
    values (
      v_courier_id,
      'open',
      3
    )
    returning id into v_batch_id;

    if v_active_deliveries > 0 then
      update public.deliveries as delivery
      set courier_batch_id = v_batch_id
      where delivery.assigned_courier_id = v_courier_id
        and delivery.status in (
          'accepted',
          'heading_to_pickup',
          'at_pickup',
          'heading_to_dropoff',
          'at_dropoff'
        );
    end if;
  end if;

  perform public.accept_delivery(p_delivery_id);

  update public.deliveries
  set courier_batch_id = v_batch_id
  where id = p_delivery_id
    and assigned_courier_id = v_courier_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'A entrega não pôde ser vinculada ao lote.';
  end if;
end;
$$;

drop policy if exists authenticated_can_read_available_or_own_deliveries
  on public.deliveries;

create policy authenticated_can_read_available_or_own_deliveries
  on public.deliveries
  for select
  to authenticated
  using (
    assigned_courier_id = auth.uid()
    or (
      status = 'available'
      and assigned_courier_id is null
      and exists (
        select 1
        from public.couriers as courier
        where courier.id = auth.uid()
      )
      and public.current_courier_can_accept_delivery()
    )
  );

update public.couriers as courier
set is_available =
  courier.is_online
  and not exists (
    select 1
    from public.courier_delivery_batches as batch
    where batch.courier_id = courier.id
      and batch.status = 'locked'
  )
where courier.is_available is distinct from (
  courier.is_online
  and not exists (
    select 1
    from public.courier_delivery_batches as batch
    where batch.courier_id = courier.id
      and batch.status = 'locked'
  )
);
